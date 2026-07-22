// C1 — Sổ chi append-only (EXPENSE / REVERSAL / ADJUSTMENT)
const mongoose = require('mongoose');

const ENTRY_TYPES = ['EXPENSE', 'REVERSAL', 'ADJUSTMENT'];

const expenseLedgerSchema = new mongoose.Schema(
  {
    entry_type: {
      type: String,
      enum: ENTRY_TYPES,
      required: true,
      index: true
    },
    expense_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
      default: null,
      index: true
    },
    expense_date: {
      type: Date,
      required: true,
      index: true
    },
    category: {
      type: String,
      default: 'OTHER',
      index: true
    },
    vendor: {
      type: String,
      default: '',
      trim: true
    },
    // Dương = chi; âm = đảo/điều chỉnh giảm
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'VND'
    },
    note: {
      type: String,
      default: '',
      trim: true
    },
    idempotency_key: {
      type: String,
      default: ''
    },
    metadata: {
      type: Object,
      default: {}
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

expenseLedgerSchema.index(
  { idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string', $ne: '' } } }
);

module.exports = mongoose.model('ExpenseLedger', expenseLedgerSchema);
module.exports.ENTRY_TYPES = ENTRY_TYPES;
