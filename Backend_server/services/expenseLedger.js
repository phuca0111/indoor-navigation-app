// C1 — Ghi sổ chi append-only
const expenseLedgerRepository = require('../repositories/expenseLedgerRepository');

function deterministicId(key) {
  return expenseLedgerRepository.deterministicEntryId(key);
}

async function postUnifiedExpense(entry, expenseId, entryType, session = null) {
  const { postBusinessEvent } = require('./unifiedLedger');
  await postBusinessEvent(entryType === 'REVERSAL' ? 'REVERSAL' : 'EXPENSE', entry, {
    source_type: 'EXPENSE_LEDGER',
    source_id: entry._id,
    posting_key: `expense-ledger:${entry._id}`,
    amount: Math.abs(entry.amount),
    occurred_at: entry.expense_date,
    created_by: entry.created_by,
    metadata: { expense_id: String(expenseId), entry_type: entryType },
    deps: session ? { session } : undefined
  });
}

async function recordExpenseEntry(expense, opts = {}) {
  if (!expense) return null;
  const expenseId = expense._id || expense.id;
  const entryType = String(opts.entry_type || 'EXPENSE').toUpperCase();
  const idempotencyKey =
    opts.idempotency_key ||
    (entryType === 'EXPENSE'
      ? `expense-${expenseId}`
      : `${entryType.toLowerCase()}-${expenseId}-${opts.suffix || Date.now()}`);

  const amount =
    opts.amount !== undefined && opts.amount !== null
      ? Number(opts.amount)
      : Number(expense.amount) || 0;

  try {
    const existed = await expenseLedgerRepository.findByIdempotencyKey(
      idempotencyKey,
      { session: opts.session }
    );
    if (existed) {
      await postUnifiedExpense(existed, expenseId, entryType, opts.session);
      return { entry: existed, duplicated: true };
    }

    const entry = await expenseLedgerRepository.createEntry({
      _id: deterministicId(idempotencyKey),
      entry_type: entryType,
      expense_id: expenseId,
      expense_date: opts.expense_date || expense.expense_date || new Date(),
      category: opts.category || expense.category || 'OTHER',
      vendor: opts.vendor != null ? opts.vendor : (expense.vendor || ''),
      amount,
      currency: opts.currency || expense.currency || 'VND',
      note: opts.note != null ? opts.note : (expense.note || ''),
      idempotency_key: idempotencyKey,
      metadata: {
        ...(opts.metadata || {}),
        source: opts.source || 'EXPENSE_API'
      },
      created_by: opts.created_by || expense.created_by || null
    }, { session: opts.session });
    await postUnifiedExpense(entry, expenseId, entryType, opts.session);
    return { entry, duplicated: false };
  } catch (err) {
    if (err?.code === 11000) {
      const existed = await expenseLedgerRepository.findByIdentityOrIdempotency({
        entryId: deterministicId(idempotencyKey),
        idempotencyKey,
        session: opts.session
      });
      await postUnifiedExpense(existed, expenseId, entryType, opts.session);
      return { entry: existed, duplicated: true };
    }
    throw err;
  }
}

async function reverseExpense(expense, opts = {}) {
  if (!expense) {
    throw Object.assign(new Error('Không tìm thấy chi phí.'), { status: 404 });
  }
  if (expense.voided_at) {
    const existed = await expenseLedgerRepository.findByIdempotencyKey(
      `reversal-${expense._id}`,
      { session: opts.session }
    );
    return { entry: existed, duplicated: true };
  }
  // Đảm bảo có dòng EXPENSE gốc trước khi đảo (backfill nhẹ)
  await recordExpenseEntry(expense, {
    created_by: opts.created_by || expense.created_by,
    source: opts.source || 'EXPENSE_BACKFILL',
    session: opts.session
  });
  const amount = -Math.abs(Number(expense.amount) || 0);
  const result = await recordExpenseEntry(expense, {
    entry_type: 'REVERSAL',
    amount,
    idempotency_key: `reversal-${expense._id}`,
    note: opts.note || `Đảo chi phí ${expense._id}`,
    created_by: opts.created_by,
    source: 'EXPENSE_REVERSAL',
    session: opts.session
  });
  return result;
}

async function listExpenseLedger(filter = {}, limit = 200) {
  return expenseLedgerRepository.listEntries({
    entryType: filter.entry_type,
    expenseId: filter.expense_id,
    from: filter.from,
    to: filter.to,
    limit
  });
}

async function sumExpenseLedger(from, to) {
  return expenseLedgerRepository.sumEntries(from, to);
}

module.exports = {
  recordExpenseEntry,
  reverseExpense,
  listExpenseLedger,
  sumExpenseLedger
};
