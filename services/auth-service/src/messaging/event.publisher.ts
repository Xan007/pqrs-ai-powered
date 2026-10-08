import { IntegrationEvent } from './events';

export type AnyIntegrationEvent = IntegrationEvent<string, unknown>;

// Business code depends on this abstraction, never on the broker client.
export interface EventPublisher {
    publish(routingKey: string, event: AnyIntegrationEvent): Promise<void>;
    close(): Promise<void>;
}

// Used when RABBITMQ_URL is not configured (and as the default in tests).
export class NoopEventPublisher implements EventPublisher {
    async publish(): Promise<void> {}
    async close(): Promise<void> {}
}
