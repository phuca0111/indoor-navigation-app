const AnalyticsEvent = require('../models/AnalyticsEvent');

const STAGES = AnalyticsEvent.STAGES;

async function upsertStage(filter, setOnInsert) {
  const event = await AnalyticsEvent.findOneAndUpdate(
    filter,
    { $setOnInsert: setOnInsert },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  return event && typeof event.toObject === 'function' ? event.toObject() : event;
}

async function aggregateFunnel(pipeline) {
  return AnalyticsEvent.aggregate(pipeline);
}

module.exports = { STAGES, upsertStage, aggregateFunnel };
