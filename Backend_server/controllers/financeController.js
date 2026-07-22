// Phase 9 — Finance & Expense (Super Admin only) + C1 ledger append-only
const {
  getFinanceOverviewForUser,
  listBillingOrgsForUser
} = require('../application/read/financeReportsQueryService');
const financeExpense = require('../application/billing/financeExpenseApplicationService');
const { EXPENSE_CATEGORIES } = financeExpense;

function requireSuper(req, res) {
  if (!req.user || !['SUPER_ADMIN', 'FINANCE_ADMIN'].includes(req.user.role)) {
    res.status(403).json({
      message: 'Chỉ Super Admin / Finance Admin được truy cập Thu – Chi / chi phí sàn.',
      code: 'FINANCE_SUPER_ONLY'
    });
    return false;
  }
  return true;
}

/** Parse YYYY-MM-DD thành giữa ngày local — tránh new Date('YYYY-MM-DD') = UTC midnight lệch bucket. */
function parseExpenseDateInput(raw) {
  if (raw == null || raw === '') return new Date();
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function getOverview(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const data = await getFinanceOverviewForUser(req.user, { date: req.query.date });
    res.status(200).json(data);
  } catch (e) {
    console.error('finance getOverview:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

async function listBillingOrgs(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const data = await listBillingOrgsForUser(req.user, { status: req.query.status });
    res.status(200).json(data);
  } catch (e) {
    console.error('finance listBillingOrgs:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

async function listExpenses(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const category = req.query.category;
    const includeVoided = String(req.query.include_voided || '') === '1';
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const items = await financeExpense.listExpenses({
      includeVoided,
      category,
      from: from && !Number.isNaN(from.getTime()) ? from : undefined,
      to: to && !Number.isNaN(to.getTime()) ? to : undefined,
      limit
    });

    res.status(200).json({
      expenses: items,
      categories: EXPENSE_CATEGORIES
    });
  } catch (e) {
    console.error('finance listExpenses:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

async function createExpense(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const body = req.body || {};
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: 'amount phải là số ≥ 0.' });
    }
    const expenseDate = parseExpenseDateInput(body.expense_date);
    if (!expenseDate) {
      return res.status(400).json({ message: 'expense_date không hợp lệ.' });
    }
    let category = String(body.category || 'OTHER').toUpperCase();
    if (!EXPENSE_CATEGORIES.includes(category)) category = 'OTHER';

    const { expense: doc, ledger } = await financeExpense.createExpense({
      expense_date: expenseDate,
      category,
      vendor: String(body.vendor || '').trim(),
      amount,
      currency: String(body.currency || 'VND').trim() || 'VND',
      note: String(body.note || '').trim(),
      created_by: req.user.userId
    });

    res.status(201).json({
      message: 'Đã thêm chi phí.',
      expense: doc,
      ledger_entry: ledger?.entry || null,
      ledger_duplicated: !!ledger?.duplicated
    });
  } catch (e) {
    console.error('finance createExpense:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

/** C1 — append-only: không sửa/xóa; dùng POST /expenses/:id/reverse */
async function updateExpense(req, res) {
  if (!requireSuper(req, res)) return;
  return res.status(405).json({
    message: 'Sổ chi append-only: không sửa chi phí. Dùng POST /api/finance/expenses/:id/reverse để đảo.',
    code: 'EXPENSE_APPEND_ONLY'
  });
}

async function deleteExpense(req, res) {
  if (!requireSuper(req, res)) return;
  return res.status(405).json({
    message: 'Sổ chi append-only: không xóa chi phí. Dùng POST /api/finance/expenses/:id/reverse để đảo.',
    code: 'EXPENSE_APPEND_ONLY'
  });
}

async function reverseExpenseHandler(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const note = String(req.body?.note || req.body?.reason || '').trim();
    const result = await financeExpense.reverseExpenseById(req.params.id, {
      note,
      created_by: req.user.userId
    });
    if (!result) return res.status(404).json({ message: 'Không tìm thấy chi phí.' });

    res.status(200).json({
      message: result.duplicated ? 'Chi phí đã đảo trước đó (idempotent).' : 'Đã đảo chi phí trên sổ.',
      expense: result.expense,
      ledger_entry: result.entry,
      duplicated: !!result.duplicated
    });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('finance reverseExpense:', e);
    res.status(status).json({
      message: e.message || 'Lỗi máy chủ',
      code: e.code || undefined
    });
  }
}

async function listExpenseLedgerHandler(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const items = await financeExpense.listLedger(
      {
        entry_type: req.query.entry_type,
        expense_id: req.query.expense_id,
        from: from && !Number.isNaN(from.getTime()) ? from : undefined,
        to: to && !Number.isNaN(to.getTime()) ? to : undefined
      },
      req.query.limit
    );
    res.status(200).json({ ledger: items });
  } catch (e) {
    console.error('finance listExpenseLedger:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

async function refundPaymentHandler(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const result = await financeExpense.refundPaymentById(req.params.id, {
      note: String(req.body?.note || '').trim(),
      external_ref: String(req.body?.external_ref || '').trim(),
      created_by: req.user.userId,
      idempotency_key: req.get('Idempotency-Key') || undefined,
      ip: req.ip
    });
    res.status(result.duplicated ? 200 : 201).json({
      message: result.duplicated
        ? 'Hoàn tiền đã xử lý trước đó (idempotent).'
        : 'Đã hoàn tiền qua nhà cung cấp và cập nhật sổ thu.',
      payment: result.payment,
      refund: result.refund,
      refund_request: result.refund_request,
      duplicated: !!result.duplicated
    });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('finance refundPayment:', e);
    res.status(status).json({
      message: e.message || 'Lỗi máy chủ',
      code: e.code || undefined
    });
  }
}

module.exports = {
  getOverview,
  listBillingOrgs,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  reverseExpenseHandler,
  listExpenseLedgerHandler,
  refundPaymentHandler
};
