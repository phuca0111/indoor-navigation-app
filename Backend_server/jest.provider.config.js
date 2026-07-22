module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/provider/**/*.test.js'],
  globalSetup: '<rootDir>/test/setup/globalProviderSetup.js',
  globalTeardown: '<rootDir>/test/setup/globalProviderTeardown.js',
  testTimeout: 60000,
  maxWorkers: 1
};
