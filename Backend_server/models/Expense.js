// Phase 9 — Chi phí vận hành nền tảng (Super Admin)
const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = [
  'MONGO_ATLAS',
  'RENDER',
  'DOMAIN',
  'CLOUDFLARE',
  'EMAIL',
  'SMS',
  'MAPS',
  'OPENAI',
  'AWS',
  'OTHER'
];

const expenseSchema = new mongoose.Schema(
  {
    expense_date: {
      type: Date,
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      default: 'OTHER',
      index: true
    },
    vendor: {
      type: String,
      default: '',
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
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
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

expenseSchema.index({ expense_date: -1, category: 1 });

const Expense = mongoose.model('Expense', expenseSchema);
Expense.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
module.exports = Expense;
