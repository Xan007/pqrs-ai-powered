import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { Channel, ConsumeMessage } from 'amqplib';
import { DEAD_LETTER_EXCHANGE, RABBITMQ_OPTIONS } from './messaging.constants';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

export interface RabbitMqOptions {
  url: string;
  exchange: string;
  deadLetterExchange?: string;
  prefetch?: number;
  reconnectDelayMs?: number;
  connectTimeoutMs?: number;
  // Injectable so the service can be unit tested without a broker.
  connect?: (url: string, socketOptions?: { timeout?: number }) => Promise<AmqpConnection>;
}

export interface QueueSubscription<T> {
  queue: string;
  routingKey: string;
  /** Validates the decoded JSON body; throw InvalidMessageError to dead-letter it. */
  parse: (body: unknown) => T;
  handle: (message: T) => Promise<void>;
}

/**
 * Infrastructure for consuming integration events. It declares the topology each
 * subscription needs (exchange, queue, binding and dead-letter queue), acks a message
 * only after its handler succeeds, and reconnects if the broker goes away.
 *
 * Failure policy:
 *  - invalid message (bad JSON / wrong shape) -> dead-lettered immediately
 *  - handler error                            -> redelivered once, then dead-lettered
 */
@Injectable()
export class RabbitMqService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private readonly subscriptions: QueueSubscription<any>[] = [];
  private connection?: AmqpConnection;
  private channel?: Channel;
  private connecting?: Promise<void>;
  private retryTimer?: { timeout: NodeJS.Timeout; resolve: () => void };
  private stopping = false;

  constructor(@Inject(RABBITMQ_OPTIONS) private readonly options: RabbitMqOptions) {}

  get isConnected(): boolean {
    return Boolean(this.channel);
  }

  onApplicationBootstrap(): void {
    if (!this.options.url) {
      this.logger.warn('RABBITMQ_URL is not set: event consumers are disabled');
      return;
    }
    // Do not block the HTTP API while the broker is starting up.
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  async subscribe<T>(subscription: QueueSubscription<T>): Promise<void> {
    this.subscriptions.push(subscription);
    if (this.channel) {
      await this.setupSubscription(this.channel, subscription);
    }
  }

  /** Resolves once connected (retrying until then) or once the service is closed. */
  connect(): Promise<void> {
    this.stopping = false;
    this.connecting ??= this.connectWithRetry().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  async close(): Promise<void> {
    this.stopping = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer.timeout);
      this.retryTimer.resolve();
    }
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // Already closed by the broker.
    } finally {
      this.channel = undefined;
      this.connection = undefined;
    }
  }

  private async connectWithRetry(): Promise<void> {
    const delay = this.options.reconnectDelayMs ?? 5000;
    for (let attempt = 1; !this.stopping; attempt++) {
      try {
        await this.open();
        this.logger.log(`Connected to RabbitMQ; consuming ${this.subscriptions.length} queue(s)`);
        return;
      } catch (err) {
        this.logger.warn(
          `RabbitMQ not available (attempt ${attempt}): ${(err as Error).message}. Retrying in ${delay}ms`,
        );
        await this.wait(delay);
      }
    }
  }

  private async open(): Promise<void> {
    const connect = this.options.connect ?? amqp.connect;
    const connection = await connect(this.options.url, {
      timeout: this.options.connectTimeoutMs ?? 5000,
    });
    connection.on('error', (err: Error) => this.logger.error(`Connection error: ${err.message}`));

    try {
      const channel = await connection.createChannel();
      channel.on('error', (err: Error) => this.logger.error(`Channel error: ${err.message}`));
      await channel.prefetch(this.options.prefetch ?? 10);
      for (const subscription of this.subscriptions) {
        await this.setupSubscription(channel, subscription);
      }

      // Registered only after a successful setup so a failed attempt does not trigger a second loop.
      channel.on('close', () => {
        if (!this.stopping) connection.close().catch(() => undefined);
      });
      connection.on('close', () => {
        this.channel = undefined;
        this.connection = undefined;
        if (!this.stopping) {
          this.logger.warn('Connection to RabbitMQ lost; reconnecting');
          void this.connect();
        }
      });

      this.connection = connection;
      this.channel = channel;
    } catch (err) {
      await connection.close().catch(() => undefined);
      throw err;
    }
  }

  private async setupSubscription<T>(channel: Channel, sub: QueueSubscription<T>): Promise<void> {
    const dlx = this.options.deadLetterExchange ?? DEAD_LETTER_EXCHANGE;
    const dlq = `${sub.queue}.dlq`;

    await channel.assertExchange(this.options.exchange, 'direct', { durable: true });
    await channel.assertExchange(dlx, 'direct', { durable: true });
    await channel.assertQueue(dlq, { durable: true });
    await channel.bindQueue(dlq, dlx, sub.routingKey);
    await channel.assertQueue(sub.queue, {
      durable: true,
      deadLetterExchange: dlx,
      deadLetterRoutingKey: sub.routingKey,
    });
    await channel.bindQueue(sub.queue, this.options.exchange, sub.routingKey);
    await channel.consume(sub.queue, (msg) => this.onMessage(channel, sub, msg), { noAck: false });
  }

  private async onMessage<T>(
    channel: Channel,
    sub: QueueSubscription<T>,
    msg: ConsumeMessage | null,
  ): Promise<void> {
    if (!msg) {
      this.logger.warn(`Consumer for ${sub.queue} was cancelled by the broker`);
      return;
    }

    let message: T;
    try {
      message = sub.parse(JSON.parse(msg.content.toString('utf8')));
    } catch (err) {
      this.logger.error(`Invalid message on ${sub.queue}, sending to DLQ: ${(err as Error).message}`);
      this.settle(() => channel.nack(msg, false, false));
      return;
    }

    try {
      await sub.handle(message);
      this.settle(() => channel.ack(msg));
    } catch (err) {
      const retry = !msg.fields.redelivered;
      this.logger.error(
        `Handler failed on ${sub.queue} (${retry ? 'requeued for one retry' : 'sending to DLQ'}): ${(err as Error).message}`,
      );
      this.settle(() => channel.nack(msg, false, retry));
    }
  }

  // If the channel closed meanwhile, the broker redelivers the unacked message on its own.
  private settle(action: () => void): void {
    try {
      action();
    } catch (err) {
      this.logger.warn(`Could not settle message: ${(err as Error).message}`);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.retryTimer = undefined;
        resolve();
      }, ms);
      this.retryTimer = { timeout, resolve };
    });
  }
}
