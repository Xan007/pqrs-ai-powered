import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { parseUserRegisteredEvent, UserRegisteredEvent } from '../events/user-registered.event';
import { Queues, RoutingKeys } from '../messaging.constants';
import { RabbitMqService } from '../rabbitmq.service';

/**
 * Reacts to users created in auth-service. The PQRS domain keeps no copy of the user,
 * so for now it only records the event; this is the hook for user-related side effects
 * (welcome notification, local user projection, ...).
 */
@Injectable()
export class UserRegisteredConsumer implements OnModuleInit {
  private readonly logger = new Logger(UserRegisteredConsumer.name);

  constructor(private readonly rabbitMq: RabbitMqService) {}

  onModuleInit(): Promise<void> {
    return this.rabbitMq.subscribe({
      queue: Queues.userRegistered,
      routingKey: RoutingKeys.userRegistered,
      parse: parseUserRegisteredEvent,
      handle: (event) => this.handle(event),
    });
  }

  async handle(event: UserRegisteredEvent): Promise<void> {
    this.logger.log(
      `UserRegistered received: user ${event.data.userId} (role ${event.data.role}) ` +
        `from ${event.source}, event ${event.eventId} created at ${event.createdAt}`,
    );
  }
}
