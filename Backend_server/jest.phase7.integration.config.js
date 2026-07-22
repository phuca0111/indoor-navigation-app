const base = require('./jest.integration.replica.config');

module.exports = {
  ...base,
  testMatch: [
    '**/test/integration/phase7ReadIsolation.test.js'
  ]
};
