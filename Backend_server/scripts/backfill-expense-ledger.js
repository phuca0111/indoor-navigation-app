/**
 * Backfill ExpenseLedger từ Expense chưa có dòng EXPENSE.
 * Usage: node scripts/backfill-expense-ledger.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const ExpenseLedger = require('../models/ExpenseLedger');
const { recordExpenseEntry } = require('../services/expenseLedger');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
  await mongoose.connect(uri);
  const expenses = await Expense.find({}).lean();
  let created = 0;
  let skipped = 0;
  for (const ex of expenses) {
    const key = `expense-${ex._id}`;
    const existed = await ExpenseLedger.findOne({ idempotency_key: key });
    if (existed) {
      skipped += 1;
      continue;
    }
    await recordExpenseEntry(ex, { source: 'BACKFILL_SCRIPT', created_by: ex.created_by });
    created += 1;
  }
  console.log(JSON.stringify({ total: expenses.length, created, skipped }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
