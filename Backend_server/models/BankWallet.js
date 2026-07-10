// Phase 5.8 — Ví ảo TPTPbank
const mongoose = require('mongoose');

const bankWalletSchema = new mongoose.Schema({
  bank_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankUser',
    required: true,
    unique: true,
    index: true
  },
  balance: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'VND' }
}, { timestamps: true });

module.exports = mongoose.model('BankWallet', bankWalletSchema);
