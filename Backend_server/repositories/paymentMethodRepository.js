const PaymentMethodConfig = require('../models/PaymentMethodConfig');

async function listPaymentMethods() {
  return PaymentMethodConfig.find({})
    .sort({ provider: 1 })
    .lean();
}

async function savePaymentMethod(provider, input) {
  return PaymentMethodConfig.findOneAndUpdate(
    { provider },
    { $set: input },
    {
      upsert: true,
      returnDocument: 'after',
      runValidators: true,
      setDefaultsOnInsert: true
    }
  ).lean();
}

module.exports = {
  listPaymentMethods,
  savePaymentMethod
};
