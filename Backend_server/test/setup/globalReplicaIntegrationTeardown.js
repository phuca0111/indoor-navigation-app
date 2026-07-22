const globalIntegrationTeardown = require('./globalIntegrationTeardown');

module.exports = async function globalReplicaIntegrationTeardown() {
  await globalIntegrationTeardown();
  if (global.__TARGET_ARCHITECTURE_REPLICA__) {
    await global.__TARGET_ARCHITECTURE_REPLICA__.stop();
    global.__TARGET_ARCHITECTURE_REPLICA__ = null;
  }
};
