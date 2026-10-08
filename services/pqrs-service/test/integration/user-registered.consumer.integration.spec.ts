import { Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { Channel } from 'amqplib';
import { randomUUID } from 'crypto';
import { parseUserRegisteredEvent, UserRegisteredEvent } from '../../src/messaging/events/user-registered.event';
import { EVENTS_EXCHANGE, RoutingKeys } from '../../src/messaging/messaging.constants';
import { QueueSubscription, RabbitMqService } from '../../src/messaging/rabbitmq.service';
import { userRegisteredExample } from '../fixtures/contracts';

// Requires a running broker: `docker compose up -d rabbitmq`, then `npm run test:integration`.
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

describe('RabbitMQ → pqrs-service consumer (integration)', () => {
  let connection: Awaited<ReturnType<typeof amqp.connect>>;
  let channel: Channel;
  let service: RabbitMqService;
  let queue: string;
  let routingKey: string;
  let handle: jest.Mock;

  // Unique queue + routing key per test, so tests never touch the real pqrs.user.registered.queue.
  const subscription = (): QueueSubscription<UserRegisteredEvent> => ({
    queue,
    routingKey,
    parse: parseUserRegisteredEvent,
    handle,
  });

  const newService = () =>
    new RabbitMqService({ url: RABBITMQ_URL, exchange: EVENTS_EXCHANGE, reconnectDelayMs: 200 });

  const publish = (body: unknown) =>
    channel.publish(
      EVENTS_EXCHANGE,
      routingKey,
      Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
      { persistent: true, contentType: 'application/json' },
    );

  const messageCount = async (q: string) => (await channel.checkQueue(q)).messageCount;

  beforeAll(async () => {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertExchange(EVENTS_EXCHANGE, 'direct', { durable: true });
  });

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const id = randomUUID().slice(0, 8);
    queue = `it.pqrs.${id}.queue`;
    routingKey = `it.user.registered.${id}`;
    handle = jest.fn().mockResolvedValue(undefined);
    service = newService();
    await service.subscribe(subscription());
    await service.connect();
  });

  afterEach(async () => {
    await service.close();
    await channel.deleteQueue(queue);
    await channel.deleteQueue(`${queue}.dlq`);
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await channel.close();
    await connection.close();
  });

  it('consumes a UserRegistered event and removes it from the queue (ack)', async () => {
    const event = userRegisteredExample();

    publish(event);

    await waitFor(() => handle.mock.calls.length === 1);
    expect(handle).toHaveBeenCalledWith(event);
    await waitFor(async () => (await messageCount(queue)) === 0);
    expect(await messageCount(`${queue}.dlq`)).toBe(0);
  });

  it('processes several events in the order they were published', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `user-${i}`);

    ids.forEach((userId) => publish({ ...userRegisteredExample(), data: { ...userRegisteredExample().data, userId } }));

    await waitFor(() => handle.mock.calls.length === ids.length);
    expect(handle.mock.calls.map(([e]) => e.data.userId)).toEqual(ids);
  });

  it('sends malformed JSON to the dead-letter queue without calling the handler', async () => {
    publish('{this is not json');

    await waitFor(async () => (await messageCount(`${queue}.dlq`)) === 1);
    expect(handle).not.toHaveBeenCalled();
    expect(await messageCount(queue)).toBe(0);
  });

  it('sends events that break the contract to the dead-letter queue', async () => {
    publish({ ...userRegisteredExample(), data: { email: 'missing-user-id@test.com' } });

    await waitFor(async () => (await messageCount(`${queue}.dlq`)) === 1);
    expect(handle).not.toHaveBeenCalled();
  });

  it('retries once when the handler fails transiently', async () => {
    handle.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(undefined);

    publish(userRegisteredExample());

    await waitFor(() => handle.mock.calls.length === 2);
    await waitFor(async () => (await messageCount(queue)) === 0);
    expect(await messageCount(`${queue}.dlq`)).toBe(0);
  });

  it('dead-letters the event when the handler keeps failing', async () => {
    handle.mockRejectedValue(new Error('permanent failure'));

    publish(userRegisteredExample());

    await waitFor(async () => (await messageCount(`${queue}.dlq`)) === 1);
    expect(handle).toHaveBeenCalledTimes(2);
    const dead = await channel.get(`${queue}.dlq`, { noAck: true });
    expect(dead && JSON.parse(dead.content.toString()).eventId).toBe(userRegisteredExample().eventId);
  });

  it('keeps events published while the consumer is offline and delivers them on restart', async () => {
    await service.close();

    publish(userRegisteredExample());
    await waitFor(async () => (await messageCount(queue)) === 1);
    expect(handle).not.toHaveBeenCalled();

    service = newService();
    await service.subscribe(subscription());
    await service.connect();

    await waitFor(() => handle.mock.calls.length === 1);
    await waitFor(async () => (await messageCount(queue)) === 0);
  });
});
