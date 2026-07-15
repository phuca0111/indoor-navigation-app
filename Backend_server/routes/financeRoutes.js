// Phase 9 — /api/finance (Super Admin + Finance Admin)
const express = require('express');
const router = express.Router();
const { auth, requireFinanceAccess } = require('../middlewares/auth');
const {
  getOverview,
  listBillingOrgs,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense
} = require('../controllers/financeController');
const {
  listPlansHandler,
  createPlan,
  updatePlan,
  listInvoices,
  createManualInvoice,
  updateInvoice,
  voidInvoice,
  markInvoicePaidHandler,
  getInvoicePdf,
  sendInvoiceEmail,
  listPaymentsHandler
} = require('../controllers/financeBillingController');
const {
  getReportSummary,
  exportReport,
  getFinanceSettings,
  updateFinanceSettings
} = require('../controllers/financeAdminController');

router.use(auth);
router.use(requireFinanceAccess);

router.get('/overview', getOverview);
router.get('/orgs', listBillingOrgs);
router.get('/expenses', listExpenses);
router.post('/expenses', createExpense);
router.patch('/expenses/:id', updateExpense);
router.delete('/expenses/:id', deleteExpense);

// Gói / hóa đơn / sổ thu
router.get('/plans', listPlansHandler);
router.post('/plans', createPlan);
router.patch('/plans/:id', updatePlan);
router.get('/invoices', listInvoices);
router.post('/invoices', createManualInvoice);
router.patch('/invoices/:id', updateInvoice);
router.post('/invoices/:id/void', voidInvoice);
router.post('/invoices/:id/mark-paid', markInvoicePaidHandler);
router.get('/invoices/:id/pdf', getInvoicePdf);
router.post('/invoices/:id/email', sendInvoiceEmail);
router.get('/payments', listPaymentsHandler);

// Báo cáo / cấu hình
router.get('/reports/summary', getReportSummary);
router.get('/reports/export', exportReport);
router.get('/settings', getFinanceSettings);
router.put('/settings', updateFinanceSettings);

module.exports = router;
