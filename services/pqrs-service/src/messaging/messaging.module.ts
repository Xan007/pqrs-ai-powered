import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRegisteredConsumer } from './consumers/user-registered.consumer';
import { EVENTS_EXCHANGE, RABBITMQ_OPTIONS } from './messaging.constants';
import { RabbitMqOptions, RabbitMqService } from './rabbitmq.service';

@Module({
  providers: [
    {
      provide: RABBITMQ_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RabbitMqOptions => ({
        // Optional: when empty, consumers stay disabled (e.g. Azure without a broker).
        url: config.get<string>('RABBITMQ_URL', ''),
        exchange: config.get<string>('RABBITMQ_EXCHANGE', EVENTS_EXCHANGE),
        prefetch: parseInt(config.get<string>('RABBITMQ_PREFETCH', '10'), 10),
      }),
    },
    RabbitMqService,
    UserRegisteredConsumer,
  ],
  exports: [RabbitMqService],
})
export class MessagingModule {}
