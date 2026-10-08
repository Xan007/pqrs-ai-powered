import 'dotenv/config';
import { Algorithm } from 'jsonwebtoken';

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const env = {
    port: parseInt(process.env.PORT || '8001', 10),
    host: process.env.HOST || '0.0.0.0',
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    jwtAlgorithm: (process.env.JWT_ALGORITHM || 'HS256') as Algorithm,
    accessTokenExpireMinutes: parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '60', 10),
    // Optional: when empty, domain events are not published (e.g. Azure without a broker).
    rabbitmqUrl: process.env.RABBITMQ_URL || '',
    rabbitmqExchange: process.env.RABBITMQ_EXCHANGE || 'microservices.events',
};
