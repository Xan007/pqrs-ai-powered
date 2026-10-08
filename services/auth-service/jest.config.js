/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.spec.ts'],
    // Broker-backed tests run separately with `npm run test:integration`.
    testPathIgnorePatterns: ['/node_modules/', '/test/integration/'],
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
    },
    setupFiles: ['<rootDir>/test/setup-env.ts'],
    collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
    clearMocks: true,
};
