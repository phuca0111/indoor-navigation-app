const mongoose = require('mongoose');

const paymentMethodConfigSchema = new mongoose.Schema({
  provider: { type: String, required: true, unique: true, uppercase: true, trim: true },
  display_name: { type: String, required: true, trim: true },
  enabled: { type: Boolean, default: false, index: true },
  mode: { type: String, enum: ['MOCK', 'SANDBOX', 'PRODUCTION'], default: 'SANDBOX' },
  currency: { type: String, default: 'VND', uppercase: true },
  capabilities: {
    checkout: { type: Boolean, default: true },
    webhook: { type: Boolean, default: true },
    query: { type: Boolean, default: false },
    refund: { type: Boolean, default: false }
  },
  public_config: { type: Object, default: {} },
  credential_env_keys: { type: [String], default: [] },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

paymentMethodConfigSchema.pre('validate', function rejectSecrets() {
  const serialized = JSON.stringify(this.public_config || {}).toLowerCase();
  if (/(secret|password|private[_-]?key|access[_-]?token)/.test(serialized)) {
    throw Object.assign(new Error('Secret chỉ được cấu hình qua biến môi trường.'), {
      code: 'PAYMENT_CONFIG_SECRET_FORBIDDEN'
    });
  }
});

module.exports = mongoose.model('PaymentMethodConfig', paymentMethodConfigSchema);
