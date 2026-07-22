module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/integration/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.transaction\\.test\\.js$'
  ],
  globalSetup: '<rootDir>/test/setup/globalIntegrationSetup.js',
  globalTeardown: '<rootDir>/test/setup/globalIntegrationTeardown.js',
  setupFiles: ['<rootDir>/test/setup/integration.js'],
  setupFilesAfterEnv: ['<rootDir>/test/setup/integrationAfterEnv.js'],
  testTimeout: 30000,
  // Redis/Bull/timers có thể giữ event-loop; CI cần thoát sau khi assert xong.
  forceExit: true,
  verbose: true
};
