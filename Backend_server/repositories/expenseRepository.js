const Expense = require('../models/Expense');

const EXPENSE_CATEGORIES = Expense.EXPENSE_CATEGORIES || [];

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function listExpenses({
  includeVoided = false,
  category,
  from,
  to,
  limit = 100
}) {
  const filter = {};
  if (!includeVoided) filter.voided_at = null;
  if (category && EXPENSE_CATEGORIES.includes(category)) filter.category = category;
  if (from || to) {
    filter.expense_date = {};
    if (from) filter.expense_date.$gte = from;
    if (to) filter.expense_date.$lte = to;
  }
  return Expense.find(filter)
    .sort({ expense_date: -1, createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .lean();
}

async function createExpense(input, { session } = {}) {
  const [created] = await Expense.create([input], session ? { session } : undefined);
  return toDto(created);
}

async function findExpenseById(expenseId, { session } = {}) {
  const query = Expense.findById(expenseId).lean();
  return session ? query.session(session) : query;
}

async function markExpenseVoided(expenseId, reason, { session } = {}) {
  return Expense.findByIdAndUpdate(
    expenseId,
    {
      $set: {
        voided_at: new Date(),
        void_reason: reason || 'REVERSED'
      }
    },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

module.exports = {
  EXPENSE_CATEGORIES,
  listExpenses,
  createExpense,
  findExpenseById,
  markExpenseVoided
};
