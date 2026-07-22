const FinanceSettings = require('../models/FinanceSettings');

async function getOrCreateDefaultSettings() {
  return FinanceSettings.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();
}

async function updateDefaultSettings(changes) {
  return FinanceSettings.findOneAndUpdate(
    { key: 'default' },
    { $set: changes, $setOnInsert: { key: 'default' } },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
      runValidators: true
    }
  ).lean();
}

module.exports = {
  getOrCreateDefaultSettings,
  updateDefaultSettings
};
