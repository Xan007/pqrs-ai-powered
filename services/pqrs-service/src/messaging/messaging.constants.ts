// Contract shared with the publishers (see services/auth-service/src/messaging/events.ts).
export const EVENTS_EXCHANGE = 'microservices.events';
export const DEAD_LETTER_EXCHANGE = 'microservices.events.dlx';

export const RoutingKeys = {
  userRegistered: 'user.registered',
} as const;

// Queues are owned by the consuming service, so they are prefixed with its name.
export const Queues = {
  userRegistered: 'pqrs.user.registered.queue',
} as const;

export const RABBITMQ_OPTIONS = Symbol('RABBITMQ_OPTIONS');
