const { createDefaultPreset } = require('ts-jest');
const tsJestTransformCfg = createDefaultPreset().transform;
module.exports = {
  testEnvironment: 'node',
  transform: tsJestTransformCfg,
  moduleNameMapper: { '^@nestjs/bullmq': '<rootDir>/test/mocks/bullmq.mock.ts', '^bullmq': '<rootDir>/test/mocks/bullmq.mock.ts' },
  // Broker-backed tests run separately with `npm run test:integration`.
  testPathIgnorePatterns: ['/node_modules/', '/test/integration/'],
};
