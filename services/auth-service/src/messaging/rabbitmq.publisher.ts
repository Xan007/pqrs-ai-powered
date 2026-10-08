import amqp, { ConfirmChannel } from 'amqplib';
import { AnyIntegrationEvent, EventPublisher } from './event.publisher';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

export interface RabbitMqPublisherOptions {
    url: string;
    exchange: string;
    connectTimeoutMs?: number;
    // Injectable so the class can be unit tested without a broker.
    connect?: (url: string, socketOptions?: { timeout?: number }) => Promise<AmqpConnection>;
}

/**
 * Publishes integration events to a durable direct exchange using a confirm channel,
 * so `publish` only resolves once RabbitMQ has taken responsibility for the message.
 * The connection is opened lazily and re-opened on the next publish if it drops.
 */
export class RabbitMqEventPublisher implements EventPublisher {
    private connection?: AmqpConnection;
    private channel?: ConfirmChannel;
    private connecting?: Promise<ConfirmChannel>;
    private closing = false;

    constructor(private readonly options: RabbitMqPublisherOptions) {}

    async publish(routingKey: string, event: AnyIntegrationEvent): Promise<void> {
        const channel = await this.getChannel();
        const body = Buffer.from(JSON.stringify(event));

        await new Promise<void>((resolve, reject) => {
            channel.publish(
                this.options.exchange,
                routingKey,
                body,
                {
                    persistent: true,
                    contentType: 'application/json',
                    messageId: event.eventId,
                    type: event.eventType,
                    appId: event.source,
                    timestamp: Math.floor(Date.parse(event.createdAt) / 1000),
                },
                (err) => (err ? reject(err) : resolve()),
            );
        });
    }

    async close(): Promise<void> {
        this.closing = true;
        try {
            await this.channel?.close();
            await this.connection?.close();
        } catch {
            // Already closed by the broker; nothing left to release.
        } finally {
            this.channel = undefined;
            this.connection = undefined;
        }
    }

    private getChannel(): Promise<ConfirmChannel> {
        if (this.channel) {
            return Promise.resolve(this.channel);
        }
        this.connecting ??= this.openChannel().finally(() => {
            this.connecting = undefined;
        });
        return this.connecting;
    }

    private async openChannel(): Promise<ConfirmChannel> {
        const connect = this.options.connect ?? amqp.connect;
        const connection = await connect(this.options.url, { timeout: this.options.connectTimeoutMs ?? 5000 });

        connection.on('error', (err: Error) => console.error('[rabbitmq] connection error:', err.message));
        connection.on('close', () => {
            this.connection = undefined;
            this.channel = undefined;
            if (!this.closing) {
                console.warn('[rabbitmq] connection lost; it will be re-opened on the next publish');
            }
        });

        try {
            const channel = await connection.createConfirmChannel();
            channel.on('error', (err: Error) => console.error('[rabbitmq] channel error:', err.message));
            channel.on('close', () => {
                this.channel = undefined;
                // A fresh connection is opened on the next publish, so release this one.
                if (!this.closing) {
                    connection.close().catch(() => undefined);
                }
            });
            await channel.assertExchange(this.options.exchange, 'direct', { durable: true });

            this.connection = connection;
            this.channel = channel;
            return channel;
        } catch (err) {
            await connection.close().catch(() => undefined);
            throw err;
        }
    }
}
