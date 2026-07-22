const eventBus = require('../shared/events/eventBus');

async function append(input, { session } = {}) {
  return eventBus.publish(input, { session });
}

module.exports = { append };
