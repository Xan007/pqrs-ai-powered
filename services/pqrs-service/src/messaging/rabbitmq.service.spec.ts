import { Logger } from '@nestjs/common';
import { FakeConnection } from '../../test/mocks/amqp.fake';
import { InvalidMessageError } from './invalid-message.error';
import { DEAD_LETTER_EXCHANGE, EVENTS_EXCHANGE } from './messaging.constants';
import { QueueSubscription, RabbitMqService } from './rabbitmq.service';

describe('RabbitMqService', () => {
  const QUEUE = 'test.queue';
  let connect: jest.Mock;
  let service: RabbitMqService;
  let handle: jest.Mock;
  let subscription: QueueSubscription<{ id: string }>;

  const build = (...connections: FakeConnection[]) => {
    connect = jest.fn();
    connections.forEach((c) => connect.mockResolvedValueOnce(c));
    service = new RabbitMqService({
      url: 'amqp://guest:guest@localhost:5672',
      exchange: EVENTS_EXCHANGE,
      reconnectDelayMs: 1,
      connect,
    });
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    handle = jest.fn().mockResolvedValue(undefined);
    subscription = {
      queue: QUEUE,
      routingKey: 'user.registered',
      parse: (body: any) => {
        if (!body?.id) throw new InvalidMessageError('missing id');
        return { id: body.id };
      },
      handle,
    };
  });

  afterEach(async () => {
    await service?.close();
    jest.restoreAllMocks();
  });

  describe('topology', () => {
    it('declares exchange, queue with dead-lettering, DLQ and bindings, then consumes with manual ack', async () => {
      const connection = new FakeConnection();
      build(connection);
      await service.subscribe(subscription);

      await service.connect();

      const ch = connection.channel;
      expect(ch.prefetch).toHaveBeenCalledWith(10);
      expect(ch.assertExchange).toHaveBeenCalledWith(EVENTS_EXCHANGE, 'direct', { durable: true });
      expect(ch.assertExchange).toHaveBeenCalledWith(DEAD_LETTER_EXCHANGE, 'direct', { durable: true });
      expect(ch.assertQueue).toHaveBeenCalledWith('test.queue.dlq', { durable: true });
      expect(ch.bindQueue).toHaveBeenCalledWith('test.queue.dlq', DEAD_LETTER_EXCHANGE, 'user.registered');
      expect(ch.assertQueue).toHaveBeenCalledWith(QUEUE, {
        durable: true,
        deadLetterExchange: DEAD_LETTER_EXCHANGE,
        deadLetterRoutingKey: 'user.registered',
      });
      expect(ch.bindQueue).toHaveBeenCalledWith(QUEUE, EVENTS_EXCHANGE, 'user.registered');
      expect(ch.consume).toHaveBeenCalledWith(QUEUE, expect.any(Function), { noAck: false });
      expect(service.isConnected).toBe(true);
    });

    it('sets up subscriptions registered after the connection is open', async () => {
      const connection = new FakeConnection();
      build(connection);
      await service.connect();

      await service.subscribe(subscription);

      expect(connection.channel.consume).toHaveBeenCalledWith(QUEUE, expect.any(Function), { noAck: false });
    });
  });

  describe('message handling', () => {
    let connection: FakeConnection;

    beforeEach(async () => {
      connection = new FakeConnection();
      build(connection);
      await service.subscribe(subscription);
      await service.connect();
    });

    it('passes the parsed message to the handler and acks it', async () => {
      await connection.channel.deliver(QUEUE, { id: 'abc', extra: true });

      expect(handle).toHaveBeenCalledWith({ id: 'abc' });
      expect(connection.channel.ack).toHaveBeenCalledTimes(1);
      expect(connection.channel.nack).not.toHaveBeenCalled();
    });

    it('dead-letters a message that is not valid JSON without calling the handler', async () => {
      await connection.channel.deliver(QUEUE, '{not json');

      expect(handle).not.toHaveBeenCalled();
      expect(connection.channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('dead-letters a message that fails validation', async () => {
      await connection.channel.deliver(QUEUE, { wrong: 'shape' });

      expect(handle).not.toHaveBeenCalled();
      expect(connection.channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('requeues once when the handler fails on the first delivery', async () => {
      handle.mockRejectedValue(new Error('db down'));

      await connection.channel.deliver(QUEUE, { id: 'abc' }, false);

      expect(connection.channel.nack).toHaveBeenCalledWith(expect.anything(), false, true);
      expect(connection.channel.ack).not.toHaveBeenCalled();
    });

    it('dead-letters when the handler fails again on the redelivery', async () => {
      handle.mockRejectedValue(new Error('db down'));

      await connection.channel.deliver(QUEUE, { id: 'abc' }, true);

      expect(connection.channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('does not crash when the channel closed before the ack', async () => {
      connection.channel.ack.mockImplementation(() => {
        throw new Error('Channel closed');
      });

      await expect(connection.channel.deliver(QUEUE, { id: 'abc' })).resolves.toBeUndefined();
    });

    it('ignores a consumer cancellation from the broker', async () => {
      await expect(connection.channel.consumers.get(QUEUE)!(null)).resolves.toBeUndefined();
      expect(handle).not.toHaveBeenCalled();
    });
  });

  describe('connection lifecycle', () => {
    it('does not connect when RABBITMQ_URL is empty', () => {
      connect = jest.fn();
      service = new RabbitMqService({ url: '', exchange: EVENTS_EXCHANGE, connect });

      service.onApplicationBootstrap();

      expect(connect).not.toHaveBeenCalled();
      expect(service.isConnected).toBe(false);
    });

    it('retries until the broker becomes available', async () => {
      const connection = new FakeConnection();
      build();
      connect
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(connection);

      await service.connect();

      expect(connect).toHaveBeenCalledTimes(3);
      expect(service.isConnected).toBe(true);
    });

    it('closes the connection when setting up the channel fails, then retries', async () => {
      const broken = new FakeConnection();
      broken.channel.assertQueue.mockRejectedValue(new Error('PRECONDITION_FAILED'));
      const healthy = new FakeConnection();
      build(broken, healthy);
      await service.subscribe(subscription);

      await service.connect();

      expect(broken.close).toHaveBeenCalled();
      expect(healthy.channel.consume).toHaveBeenCalled();
      expect(service.isConnected).toBe(true);
    });

    it('reconnects and re-subscribes after the connection drops', async () => {
      const first = new FakeConnection();
      const second = new FakeConnection();
      build(first, second);
      await service.subscribe(subscription);
      await service.connect();

      first.emit('close');
      await service.connect();

      expect(connect).toHaveBeenCalledTimes(2);
      expect(second.channel.consume).toHaveBeenCalledWith(QUEUE, expect.any(Function), { noAck: false });
    });

    it('stops retrying once closed', async () => {
      build();
      connect.mockRejectedValue(new Error('ECONNREFUSED'));

      const pending = service.connect();
      await service.close();
      await pending;

      expect(service.isConnected).toBe(false);
    });

    it('closes channel and connection on shutdown without reconnecting', async () => {
      const connection = new FakeConnection();
      build(connection);
      await service.connect();

      await service.onModuleDestroy();

      expect(connection.channel.close).toHaveBeenCalled();
      expect(connection.close).toHaveBeenCalled();
      expect(connect).toHaveBeenCalledTimes(1);
    });
  });
});
