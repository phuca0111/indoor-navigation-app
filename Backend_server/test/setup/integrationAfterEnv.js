const mongoose = require('mongoose');

afterAll(async () => {
  try {
    const { resetRedisForTests } = require('../../utils/redisClient');
    resetRedisForTests();
  } catch (_) {
    // Redis optional trong một số suite.
  }
  try {
    const eventBus = require('../../shared/events/eventBus');
    if (typeof eventBus.resetSubscribersForTests === 'function') {
      eventBus.resetSubscribersForTests();
    }
  } catch (_) {
    // ignore
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
