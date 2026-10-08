import 'reflect-metadata';
import cors from 'cors';
import express from 'express';
import { UserController } from './controllers/user.controller';
import { EventPublisher, NoopEventPublisher } from './messaging/event.publisher';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { prisma } from './prisma/prisma.client';
import { UserRepository } from './repositories/user.repository';
import { authRoutes } from './routes/auth.routes';
import { UserService } from './services/user.service';

export function createApp(
    userRepository: UserRepository = new UserRepository(prisma),
    eventPublisher: EventPublisher = new NoopEventPublisher(),
) {
    const app = express();

    app.use(cors());
    app.use(express.json());

    const userService = new UserService(userRepository, eventPublisher);
    const userController = new UserController(userService);

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', service: 'auth-service' });
    });

    app.use('/api/v1', authRoutes(userController));

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}
