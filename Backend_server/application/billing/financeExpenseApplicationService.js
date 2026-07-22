const expenseRepository = require('../../repositories/expenseRepository');
const {
  recordExpenseEntry,
  reverseExpense,
  listExpenseLedger
} = require('../../services/expenseLedger');
const { refundPayment } = require('../../services/refundService');
const { runBillingCommand } = require('./runBillingCommand');

async function listExpenses(input) {
  return expenseRepository.listExpenses(input);
}

async function createExpense(input, options = {}) {
  return runBillingCommand(async (session) => {
    const expense = await expenseRepository.createExpense(input, { session });
    const ledger = await recordExpenseEntry(expense, {
      created_by: input.created_by,
      source: 'EXPENSE_API',
      session
    });
    return { expense, ledger };
  }, options);
}

async function reverseExpenseById(expenseId, input = {}, options = {}) {
  return runBillingCommand(async (session) => {
    let expense = await expenseRepository.findExpenseById(expenseId, { session });
    if (!expense) return null;

    const result = await reverseExpense(expense, {
      note: input.note,
      created_by: input.created_by,
      session
    });
    if (!expense.voided_at) {
      expense = await expenseRepository.markExpenseVoided(
        expense._id,
        input.note,
        { session }
      );
    }
    return { expense, ...result };
  }, options);
}

async function listLedger(filter, limit) {
  return listExpenseLedger(filter, limit);
}

async function refundPaymentById(paymentId, input) {
  return refundPayment(paymentId, input);
}

module.exports = {
  EXPENSE_CATEGORIES: expenseRepository.EXPENSE_CATEGORIES,
  listExpenses,
  createExpense,
  reverseExpenseById,
  listLedger,
  refundPaymentById
};
