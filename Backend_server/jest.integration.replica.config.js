const base = require('./jest.integration.config');

module.exports = {
  ...base,
  testMatch: ['**/test/integration/**/*.transaction.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  globalSetup: '<rootDir>/test/setup/globalReplicaIntegrationSetup.js',
  globalTeardown: '<rootDir>/test/setup/globalReplicaIntegrationTeardown.js',
  setupFiles: ['<rootDir>/test/setup/replicaIntegration.js'],
  testTimeout: 60000
};
