module.exports = async function globalProviderTeardown() {
  if (global.__TARGET_ARCHITECTURE_REDIS__) {
    await global.__TARGET_ARCHITECTURE_REDIS__.stop();
    global.__TARGET_ARCHITECTURE_REDIS__ = null;
  }
};
