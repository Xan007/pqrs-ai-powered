import amqp, { Channel, GetMessage } from 'amqplib';
import { EVENTS_EXCHANGE, RoutingKeys, UserRegisteredEvent } from '../../src/messaging/events';
import { RabbitMqEventPublisher } from '../../src/messaging/rabbitmq.publisher';
import { UserRepository } from '../../src/repositories/user.repository';
import { UserService } from '../../src/services/user.service';
import { buildUser, createUserRepositoryMock } from '../helpers/user-repository.mock';

// Requires a running broker: `docker compose up -d rabbitmq`, then `npm run test:integration`.
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

async function getOne(channel: Channel, queue: string, timeoutMs = 5000): Promise<GetMessage> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const msg = await channel.get(queue, { noAck: true });
        if (msg) return msg;
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`No message arrived on ${queue} within ${timeoutMs}ms`);
}

describe('auth-service → RabbitMQ (integration)', () => {
    let connection: Awaited<ReturnType<typeof amqp.connect>>;
    let channel: Channel;
    let spyQueue: string;
    let publisher: RabbitMqEventPublisher;

    beforeAll(async () => {
        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertExchange(EVENTS_EXCHANGE, 'direct', { durable: true });
        // Private queue bound like a real consumer, so the test never steals pqrs-service messages.
        const { queue } = await channel.assertQueue('', { exclusive: true, autoDelete: true });
        spyQueue = queue;
        await channel.bindQueue(spyQueue, EVENTS_EXCHANGE, RoutingKeys.userRegistered);
    });

    beforeEach(() => {
        publisher = new RabbitMqEventPublisher({ url: RABBITMQ_URL, exchange: EVENTS_EXCHANGE });
    });

    afterEach(async () => {
        await publisher.close();
        await channel.purgeQueue(spyQueue);
    });

    afterAll(async () => {
        await channel.close();
        await connection.close();
    });

    it('routes the UserRegistered event of a new registration to the bound queue', async () => {
        const user = buildUser({ id: 'int-user-1', email: 'integration@test.com' });
        const repo = createUserRepositoryMock();
        repo.findByEmail.mockResolvedValue(null);
        repo.create.mockResolvedValue(user);
        const service = new UserService(repo as unknown as UserRepository, publisher);

        await service.register({ email: 'integration@test.com', password: 'password123' });

        const msg = await getOne(channel, spyQueue);
        const event = JSON.parse(msg.content.toString()) as UserRegisteredEvent;
        expect(msg.fields.exchange).toBe(EVENTS_EXCHANGE);
        expect(msg.fields.routingKey).toBe('user.registered');
        expect(msg.properties).toMatchObject({
            contentType: 'application/json',
            deliveryMode: 2,
            type: 'UserRegistered',
            messageId: event.eventId,
        });
        expect(event).toMatchObject({
            eventType: 'UserRegistered',
            source: 'auth-service',
            data: { userId: 'int-user-1', email: 'integration@test.com', role: 'USER', status: 'ACTIVE' },
        });
    });

    it('delivers every message in publish order', async () => {
        const users = Array.from({ length: 5 }, (_, i) => buildUser({ id: `bulk-${i}`, email: `bulk${i}@test.com` }));
        const repo = createUserRepositoryMock();
        repo.findByEmail.mockResolvedValue(null);
        users.forEach((u) => repo.create.mockResolvedValueOnce(u));
        const service = new UserService(repo as unknown as UserRepository, publisher);

        for (const u of users) {
            await service.register({ email: u.email, password: 'password123' });
        }

        const received: string[] = [];
        for (let i = 0; i < users.length; i++) {
            const msg = await getOne(channel, spyQueue);
            received.push(JSON.parse(msg.content.toString()).data.userId);
        }
        expect(received).toEqual(users.map((u) => u.id));
    });

    it('fails fast when the broker cannot be reached', async () => {
        const unreachable = new RabbitMqEventPublisher({
            url: 'amqp://guest:guest@127.0.0.1:1',
            exchange: EVENTS_EXCHANGE,
            connectTimeoutMs: 1000,
        });

        await expect(
            unreachable.publish(RoutingKeys.userRegistered, {
                eventId: 'x',
                eventType: 'UserRegistered',
                source: 'auth-service',
                createdAt: new Date().toISOString(),
                data: {},
            }),
        ).rejects.toThrow();
    });
});
