import { env } from './config/env';
import { createApp } from './app';
import { EventPublisher, NoopEventPublisher } from './messaging/event.publisher';
import { RabbitMqEventPublisher } from './messaging/rabbitmq.publisher';
import { prisma } from './prisma/prisma.client';
import { UserRepository } from './repositories/user.repository';

function createEventPublisher(): EventPublisher {
    if (!env.rabbitmqUrl) {
        console.warn('RABBITMQ_URL is not set: domain events will not be published');
        return new NoopEventPublisher();
    }
    return new RabbitMqEventPublisher({ url: env.rabbitmqUrl, exchange: env.rabbitmqExchange });
}

async function bootstrap() {
    await prisma.$connect();

    const eventPublisher = createEventPublisher();
    const app = createApp(new UserRepository(prisma), eventPublisher);
    const server = app.listen(env.port, env.host, () => {
        console.log(`Auth Service running on http://localhost:${env.port}`);
    });

    const shutdown = async () => {
        server.close();
        await eventPublisher.close();
        await prisma.$disconnect();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
    console.error('Failed to start Auth Service', err);
    process.exit(1);
});
