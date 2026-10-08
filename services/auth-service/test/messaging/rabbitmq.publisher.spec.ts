import { buildUserRegisteredEvent, EVENTS_EXCHANGE, RoutingKeys } from '../../src/messaging/events';
import { RabbitMqEventPublisher } from '../../src/messaging/rabbitmq.publisher';
import { createConnectMock, FakeConnection } from '../helpers/amqp.fake';
import { buildUser } from '../helpers/user-repository.mock';

describe('RabbitMqEventPublisher', () => {
    const event = buildUserRegisteredEvent(buildUser());

    function createPublisher(...connections: FakeConnection[]) {
        const connect = createConnectMock(...connections);
        const publisher = new RabbitMqEventPublisher({
            url: 'amqp://guest:guest@localhost:5672',
            exchange: EVENTS_EXCHANGE,
            connect: connect as never,
        });
        return { publisher, connect };
    }

    beforeEach(() => {
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('declares a durable direct exchange before publishing', async () => {
        const connection = new FakeConnection();
        const { publisher, connect } = createPublisher(connection);

        await publisher.publish(RoutingKeys.userRegistered, event);

        expect(connect).toHaveBeenCalledWith('amqp://guest:guest@localhost:5672', { timeout: 5000 });
        expect(connection.channel.assertExchange).toHaveBeenCalledWith(EVENTS_EXCHANGE, 'direct', { durable: true });
    });

    it('publishes the event as persistent JSON with its metadata', async () => {
        const connection = new FakeConnection();
        const { publisher } = createPublisher(connection);

        await publisher.publish(RoutingKeys.userRegistered, event);

        const [exchange, routingKey, content, options] = connection.channel.publish.mock.calls[0];
        expect(exchange).toBe(EVENTS_EXCHANGE);
        expect(routingKey).toBe('user.registered');
        expect(JSON.parse(content.toString())).toEqual(event);
        expect(options).toMatchObject({
            persistent: true,
            contentType: 'application/json',
            messageId: event.eventId,
            type: 'UserRegistered',
            appId: 'auth-service',
        });
    });

    it('reuses the same connection and channel for consecutive publishes', async () => {
        const connection = new FakeConnection();
        const { publisher, connect } = createPublisher(connection);

        await Promise.all([
            publisher.publish(RoutingKeys.userRegistered, event),
            publisher.publish(RoutingKeys.userRegistered, event),
        ]);
        await publisher.publish(RoutingKeys.userRegistered, event);

        expect(connect).toHaveBeenCalledTimes(1);
        expect(connection.channel.publish).toHaveBeenCalledTimes(3);
    });

    it('rejects when the broker does not confirm the message', async () => {
        const connection = new FakeConnection();
        connection.channel.confirmError = new Error('nacked');
        const { publisher } = createPublisher(connection);

        await expect(publisher.publish(RoutingKeys.userRegistered, event)).rejects.toThrow('nacked');
    });

    it('rejects when the broker is unreachable', async () => {
        const connect = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        const publisher = new RabbitMqEventPublisher({ url: 'amqp://x', exchange: EVENTS_EXCHANGE, connect });

        await expect(publisher.publish(RoutingKeys.userRegistered, event)).rejects.toThrow('ECONNREFUSED');
    });

    it('reconnects on the next publish after the connection is lost', async () => {
        const first = new FakeConnection();
        const second = new FakeConnection();
        const { publisher, connect } = createPublisher(first, second);

        await publisher.publish(RoutingKeys.userRegistered, event);
        first.emit('close');
        await publisher.publish(RoutingKeys.userRegistered, event);

        expect(connect).toHaveBeenCalledTimes(2);
        expect(second.channel.publish).toHaveBeenCalledTimes(1);
    });

    it('closes the connection if the channel cannot be set up', async () => {
        const connection = new FakeConnection();
        connection.channel.assertExchange.mockRejectedValue(new Error('PRECONDITION_FAILED'));
        const { publisher } = createPublisher(connection);

        await expect(publisher.publish(RoutingKeys.userRegistered, event)).rejects.toThrow('PRECONDITION_FAILED');
        expect(connection.close).toHaveBeenCalled();
    });

    it('closes channel and connection on shutdown', async () => {
        const connection = new FakeConnection();
        const { publisher } = createPublisher(connection);
        await publisher.publish(RoutingKeys.userRegistered, event);

        await publisher.close();

        expect(connection.channel.close).toHaveBeenCalled();
        expect(connection.close).toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
    });
});
