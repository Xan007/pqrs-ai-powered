import { buildUserRegisteredEvent, EVENTS_EXCHANGE, RoutingKeys } from '../../src/messaging/events';
import { loadContract } from '../fixtures/contracts';
import { buildUser } from '../helpers/user-repository.mock';

describe('buildUserRegisteredEvent', () => {
    it('wraps the public user data in the integration event envelope', () => {
        const user = buildUser();

        const event = buildUserRegisteredEvent(user);

        expect(event).toEqual({
            eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
            eventType: 'UserRegistered',
            source: 'auth-service',
            createdAt: expect.any(String),
            data: { userId: user.id, email: user.email, role: 'USER', status: 'ACTIVE' },
        });
        expect(new Date(event.createdAt).toISOString()).toBe(event.createdAt);
    });

    it('matches the shared contract consumed by pqrs-service', () => {
        const contract = loadContract('user-registered');
        const event = buildUserRegisteredEvent(buildUser());

        expect(EVENTS_EXCHANGE).toBe(contract.exchange);
        expect(RoutingKeys.userRegistered).toBe(contract.routingKey);
        expect(Object.keys(event).sort()).toEqual(Object.keys(contract.example).sort());
        expect(Object.keys(event.data).sort()).toEqual(Object.keys(contract.example.data).sort());
        expect(event.eventType).toBe(contract.example.eventType);
        expect(event.source).toBe(contract.example.source);
    });

    it('never leaks the password hash', () => {
        const event = buildUserRegisteredEvent(buildUser());

        expect(JSON.stringify(event)).not.toContain('$2b$');
    });

    it('generates a unique id per event', () => {
        const user = buildUser();

        expect(buildUserRegisteredEvent(user).eventId).not.toBe(buildUserRegisteredEvent(user).eventId);
    });
});
