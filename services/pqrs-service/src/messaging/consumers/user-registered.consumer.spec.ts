import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseUserRegisteredEvent } from '../events/user-registered.event';
import { Queues, RoutingKeys } from '../messaging.constants';
import { RabbitMqService } from '../rabbitmq.service';
import { UserRegisteredConsumer } from './user-registered.consumer';

describe('UserRegisteredConsumer', () => {
  const rabbitMq = { subscribe: jest.fn().mockResolvedValue(undefined) };
  let consumer: UserRegisteredConsumer;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UserRegisteredConsumer, { provide: RabbitMqService, useValue: rabbitMq }],
    }).compile();
    consumer = module.get(UserRegisteredConsumer);
  });

  afterEach(() => jest.clearAllMocks());

  it('subscribes its own queue to the user.registered routing key on startup', async () => {
    await consumer.onModuleInit();

    expect(rabbitMq.subscribe).toHaveBeenCalledWith({
      queue: Queues.userRegistered,
      routingKey: RoutingKeys.userRegistered,
      parse: parseUserRegisteredEvent,
      handle: expect.any(Function),
    });
    expect(Queues.userRegistered).toBe('pqrs.user.registered.queue');
  });

  it('routes deliveries to handle()', async () => {
    const handle = jest.spyOn(consumer, 'handle').mockResolvedValue(undefined);
    await consumer.onModuleInit();
    const event = { eventId: 'e1', data: { userId: 'u1' } } as any;

    await rabbitMq.subscribe.mock.calls[0][0].handle(event);

    expect(handle).toHaveBeenCalledWith(event);
  });

  it('logs the received user without exposing the email', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await consumer.handle({
      eventId: 'e1',
      eventType: 'UserRegistered',
      source: 'auth-service',
      createdAt: '2026-10-08T10:00:00.000Z',
      data: { userId: 'u1', email: 'juan@test.com', role: 'USER', status: 'ACTIVE' },
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('user u1'));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('juan@test.com'));
    log.mockRestore();
  });
});
