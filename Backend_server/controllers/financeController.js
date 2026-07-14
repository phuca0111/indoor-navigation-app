// Phase 9 — Finance & Expense (Super Admin only)
const Expense = require('../models/Expense');
const EXPENSE_CATEGORIES = Expense.EXPENSE_CATEGORIES || [];
const {
  getFinanceOverview,
  listOrgsForBilling
} = require('../services/financeService');

function requireSuper(req, res) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({
      message: 'Chỉ Super Admin được truy cập Thu – Chi / chi phí sàn.',
      code: 'FINANCE_SUPER_ONLY'
    });
    return false;
  }
  return true;
}

async function getOverview(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const data = await getFinanceOverview();
    res.status(200).json(data);
  } catch (e) {
    console.error('finance getOverview:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

async function listBillingOrgs(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const data = await listOrgsForBilling({ status: req.query.status });
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
    const filter = {};
    if (category && EXPENSE_CATEGORIES.includes(category)) {
      filter.category = category;
    }
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (from && !Number.isNaN(from.getTime())) {
      filter.expense_date = filter.expense_date || {};
      filter.expense_date.$gte = from;
    }
    if (to && !Number.isNaN(to.getTime())) {
      filter.expense_date = filter.expense_date || {};
      filter.expense_date.$lte = to;
    }

    const items = await Expense.find(filter)
      .sort({ expense_date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

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
    const expenseDate = body.expense_date ? new Date(body.expense_date) : new Date();
    if (Number.isNaN(expenseDate.getTime())) {
      return res.status(400).json({ message: 'expense_date không hợp lệ.' });
    }
    let category = String(body.category || 'OTHER').toUpperCase();
    if (!EXPENSE_CATEGORIES.includes(category)) category = 'OTHER';

    const doc = await Expense.create({
      expense_date: expenseDate,
      category,
      vendor: String(body.vendor || '').trim(),
      amount,
      currency: String(body.currency || 'VND').trim() || 'VND',
      note: String(body.note || '').trim(),
      created_by: req.user.userId
    });

    res.status(201).json({ message: 'Đã thêm chi phí.', expense: doc });
  } catch (e) {
    console.error('finance createExpense:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

async function updateExpense(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const doc = await Expense.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy chi phí.' });

    const body = req.body || {};
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: 'amount phải là số ≥ 0.' });
      }
      doc.amount = amount;
    }
    if (body.expense_date !== undefined) {
      const d = new Date(body.expense_date);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ message: 'expense_date không hợp lệ.' });
      }
      doc.expense_date = d;
    }
    if (body.category !== undefined) {
      const category = String(body.category || 'OTHER').toUpperCase();
      if (!EXPENSE_CATEGORIES.includes(category)) {
        return res.status(400).json({ message: 'category không hợp lệ.' });
      }
      doc.category = category;
    }
    if (body.vendor !== undefined) doc.vendor = String(body.vendor || '').trim();
    if (body.note !== undefined) doc.note = String(body.note || '').trim();
    if (body.currency !== undefined) {
      doc.currency = String(body.currency || 'VND').trim() || 'VND';
    }

    await doc.save();
    res.status(200).json({ message: 'Đã cập nhật chi phí.', expense: doc });
  } catch (e) {
    console.error('finance updateExpense:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

async function deleteExpense(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const doc = await Expense.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy chi phí.' });
    res.status(200).json({ message: 'Đã xóa chi phí.', expense_id: req.params.id });
  } catch (e) {
    console.error('finance deleteExpense:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

module.exports = {
  getOverview,
  listBillingOrgs,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense
};
