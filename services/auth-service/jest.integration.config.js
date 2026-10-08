const base = require('./jest.config');

/** Integration tests: need the RabbitMQ container running (docker compose up -d rabbitmq). */
/** @type {import('jest').Config} */
module.exports = {
    ...base,
    testMatch: ['<rootDir>/test/integration/**/*.integration.spec.ts'],
    testPathIgnorePatterns: ['/node_modules/'],
    testTimeout: 20000,
};
