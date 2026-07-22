const ledgerRepository = require('../repositories/ledgerRepository');
const { ACCOUNTS } = require('./unifiedLedger');

function isLedgerReadV2() {
  return String(process.env.FINANCE_LEDGER_READ_V2 || '').toLowerCase() === 'true';
}

function isShadowCompareEnabled() {
  return String(process.env.FINANCE_LEDGER_SHADOW_COMPARE || 'true').toLowerCase() !== 'false';
}

async function signedAccountTotal(accountCode, start, end) {
  return ledgerRepository.signedAccountTotal(accountCode, start, end);
}

async function ledgerTotals(start, end) {
  const [revenue, refunds, expense] = await Promise.all([
    signedAccountTotal(ACCOUNTS.REVENUE, start, end),
    signedAccountTotal(ACCOUNTS.REFUNDS, start, end),
    signedAccountTotal(ACCOUNTS.EXPENSE, start, end)
  ]);
  return {
    revenue: revenue.amount - Math.abs(refunds.amount),
    gross_revenue: revenue.amount,
    refunds: Math.abs(refunds.amount),
    expense: Math.abs(expense.amount),
    revenue_count: revenue.count,
    expense_count: expense.count
  };
}

function compareLegacyAndLedger(legacy, ledger) {
  return {
    revenue_delta: Number(ledger.revenue) - Number(legacy.revenue),
    expense_delta: Number(ledger.expense) - Number(legacy.expense),
    matched: Number(ledger.revenue) === Number(legacy.revenue) &&
      Number(ledger.expense) === Number(legacy.expense)
  };
}

module.exports = { isLedgerReadV2, isShadowCompareEnabled, signedAccountTotal, ledgerTotals, compareLegacyAndLedger };
