const { createLedgerRepository } = require('../repositories/ledgerRepository');

const ACCOUNTS = Object.freeze({
  CASH: '1000_CASH',
  PROVIDER_CLEARING: '1010_PROVIDER_CLEARING',
  ACCOUNTS_RECEIVABLE: '1100_ACCOUNTS_RECEIVABLE',
  REVENUE: '4000_SUBSCRIPTION_REVENUE',
  REFUNDS: '4010_REFUNDS_CONTRA_REVENUE',
  EXPENSE: '5000_OPERATING_EXPENSE',
  ACCOUNTS_PAYABLE: '2000_ACCOUNTS_PAYABLE'
});

function toMinorUnits(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    throw Object.assign(new Error('Số tiền không hợp lệ.'), { code: 'INVALID_MONEY' });
  }
  return Math.round(value);
}

function assertBalanced(entries) {
  if (!Array.isArray(entries) || entries.length < 2) {
    throw Object.assign(new Error('Bút toán cần ít nhất hai dòng.'), { code: 'LEDGER_ENTRIES_REQUIRED' });
  }
  const debit = entries.filter((e) => e.side === 'DEBIT').reduce((sum, e) => sum + toMinorUnits(e.amount_minor), 0);
  const credit = entries.filter((e) => e.side === 'CREDIT').reduce((sum, e) => sum + toMinorUnits(e.amount_minor), 0);
  if (debit !== credit || debit <= 0) {
    throw Object.assign(new Error(`Bút toán không cân bằng: debit=${debit}, credit=${credit}.`), {
      code: 'LEDGER_UNBALANCED'
    });
  }
  return { debit, credit };
}

function buildPosting({ type, amount, cashAccount = ACCOUNTS.CASH, counterpartyAccount }) {
  const amountMinor = Math.abs(toMinorUnits(amount));
  const account = counterpartyAccount || (
    type === 'INCOME' ? ACCOUNTS.REVENUE :
    type === 'REFUND' ? ACCOUNTS.REFUNDS :
    ACCOUNTS.EXPENSE
  );
  if (type === 'INCOME' || type === 'REVERSAL') {
    return [
      { account_code: cashAccount, side: 'DEBIT', amount_minor: amountMinor },
      { account_code: account, side: 'CREDIT', amount_minor: amountMinor }
    ];
  }
  return [
    { account_code: account, side: 'DEBIT', amount_minor: amountMinor },
    { account_code: cashAccount, side: 'CREDIT', amount_minor: amountMinor }
  ];
}

async function postTransaction(input, deps = {}) {
  const repository = createLedgerRepository(deps);
  const entries = input.entries || buildPosting(input);
  assertBalanced(entries);
  const existing = await repository.findByPostingKey(input.posting_key, {
    session: deps.session
  });
  if (existing) return { transaction: existing, duplicated: true };

  let transaction;
  try {
    transaction = await repository.createTransaction({
      source_type: input.source_type,
      source_id: String(input.source_id),
      posting_key: input.posting_key,
      transaction_type: input.type,
      currency: String(input.currency || 'VND').toUpperCase(),
      occurred_at: input.occurred_at || new Date(),
      description: input.description || '',
      organization_id: input.organization_id || null,
      metadata: input.metadata || {},
      created_by: input.created_by || null
    }, { session: deps.session });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    transaction = await repository.findByPostingKey(input.posting_key, {
      session: deps.session
    });
    return { transaction, duplicated: true };
  }
  try {
    await repository.insertEntries(entries.map((entry) => ({
      ...entry,
      transaction_id: transaction._id,
      currency: String(input.currency || 'VND').toUpperCase(),
      organization_id: input.organization_id || null,
      occurred_at: input.occurred_at || transaction.occurred_at,
      metadata: entry.metadata || {}
    })), { session: deps.session });
  } catch (error) {
    await repository.deleteTransaction(transaction._id, {
      session: deps.session
    }).catch(() => {});
    throw error;
  }
  return { transaction, duplicated: false };
}

async function postBusinessEvent(type, source, opts = {}) {
  if (String(process.env.FINANCE_LEDGER_DUAL_WRITE_V2 || '').toLowerCase() !== 'true' && !opts.force) {
    return { skipped: true, reason: 'FINANCE_LEDGER_DUAL_WRITE_V2_DISABLED' };
  }
  return postTransaction({
    type,
    source_type: opts.source_type || source.constructor?.modelName || 'BUSINESS',
    source_id: source._id || source.id,
    posting_key: opts.posting_key || `${String(type).toLowerCase()}:${source._id || source.id}`,
    amount: opts.amount == null ? source.amount : opts.amount,
    currency: opts.currency || source.currency || 'VND',
    occurred_at: opts.occurred_at || source.paid_at || source.expense_date || new Date(),
    organization_id: opts.organization_id || source.organization_id || null,
    description: opts.description || source.note || '',
    metadata: opts.metadata || {},
    created_by: opts.created_by || source.created_by || null,
    cashAccount: opts.cash_account,
    counterpartyAccount: opts.counterparty_account,
    entries: opts.entries
  }, opts.deps);
}

async function postTransfer({ source_id, posting_key, amount, currency = 'VND', from_account, to_account, ...rest }) {
  const amountMinor = Math.abs(toMinorUnits(amount));
  return postTransaction({
    ...rest,
    type: 'TRANSFER',
    source_type: rest.source_type || 'CASH_TRANSFER',
    source_id,
    posting_key,
    currency,
    entries: [
      { account_code: to_account, side: 'DEBIT', amount_minor: amountMinor },
      { account_code: from_account, side: 'CREDIT', amount_minor: amountMinor }
    ]
  }, rest.deps);
}

module.exports = {
  ACCOUNTS,
  toMinorUnits,
  assertBalanced,
  buildPosting,
  postTransaction,
  postBusinessEvent,
  postTransfer
};
