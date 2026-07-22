const base = require('./jest.integration.config');

module.exports = {
  ...base,
  testMatch: [
    '**/test/integration/userApi.test.js',
    '**/test/integration/orgInvite.test.js',
    '**/test/integration/permissionsRbacroutes.test.js',
    '**/test/integration/phase4_1ResetPassword.test.js'
  ],
  globalSetup: '<rootDir>/test/setup/globalReplicaIntegrationSetup.js',
  globalTeardown: '<rootDir>/test/setup/globalReplicaIntegrationTeardown.js',
  setupFiles: ['<rootDir>/test/setup/replicaIntegration.js'],
  testTimeout: 60000
};
