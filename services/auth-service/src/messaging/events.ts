import { randomUUID } from 'crypto';
import { UserModel } from '../models/user.model';

// Contract shared with the consumers (see services/pqrs-service/src/messaging/events).
export const EVENTS_EXCHANGE = 'microservices.events';

export const RoutingKeys = {
    userRegistered: 'user.registered',
} as const;

export interface IntegrationEvent<TType extends string, TData> {
    eventId: string;
    eventType: TType;
    source: string;
    createdAt: string;
    data: TData;
}

export type UserRegisteredEvent = IntegrationEvent<
    'UserRegistered',
    { userId: string; email: string; role: string; status: 'ACTIVE' }
>;

export function buildUserRegisteredEvent(user: Pick<UserModel, 'id' | 'email' | 'role'>): UserRegisteredEvent {
    return {
        eventId: randomUUID(),
        eventType: 'UserRegistered',
        source: 'auth-service',
        createdAt: new Date().toISOString(),
        data: { userId: user.id, email: user.email, role: user.role, status: 'ACTIVE' },
    };
}
