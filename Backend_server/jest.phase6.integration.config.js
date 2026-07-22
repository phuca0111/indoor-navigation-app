const base = require('./jest.integration.replica.config');

module.exports = {
  ...base,
  testMatch: [
    '**/test/integration/phaseD2Notifications.test.js',
    '**/test/integration/phaseD3Search.test.js',
    '**/test/integration/websiteCms.test.js',
    '**/test/integration/websiteCmsFull.test.js',
    '**/test/integration/phase2dStorage.test.js',
    '**/test/integration/phase6Content.transaction.test.js'
  ]
};
