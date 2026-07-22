// Phase 9 — /api/finance (Super Admin + Finance Admin)
const express = require('express');
const router = express.Router();
const { auth, requirePermission, P } = require('../middlewares/auth');
const {
  getOverview,
  listBillingOrgs,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  reverseExpenseHandler,
  listExpenseLedgerHandler,
  refundPaymentHandler
} = require('../controllers/financeController');
const {
  listPlansHandler,
  createPlan,
  updatePlan,
  deletePlan,
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
const {
  listPaymentMethods,
  upsertPaymentMethod,
  createReconciliation,
  listReconciliations,
  getReconciliation,
  getDiscrepancies
} = require('../controllers/financeOperationsController');

router.use(auth);
router.use(requirePermission(P.FINANCE_ACCESS));

router.get('/overview', getOverview);
router.get('/orgs', listBillingOrgs);
router.get('/expenses', listExpenses);
router.post('/expenses', createExpense);
router.get('/expense-ledger', listExpenseLedgerHandler);
router.post('/expenses/:id/reverse', reverseExpenseHandler);
router.patch('/expenses/:id', updateExpense);
router.delete('/expenses/:id', deleteExpense);
router.post('/payments/:id/refund', refundPaymentHandler);

// Gói / hóa đơn / sổ thu
router.get('/plans', listPlansHandler);
router.post('/plans', createPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);
router.get('/invoices', listInvoices);
router.post('/invoices', createManualInvoice);
router.patch('/invoices/:id', updateInvoice);
router.post('/invoices/:id/void', voidInvoice);
router.post('/invoices/:id/mark-paid', markInvoicePaidHandler);
router.get('/invoices/:id/pdf', getInvoicePdf);
router.post('/invoices/:id/email', sendInvoiceEmail);
router.get('/payments', listPaymentsHandler);
router.get('/payment-methods', listPaymentMethods);
router.put('/payment-methods/:provider', requirePermission(P.FINANCE_SETTINGS), upsertPaymentMethod);

router.get('/reconciliations', listReconciliations);
router.post('/reconciliations', createReconciliation);
router.get('/reconciliations/:id', getReconciliation);
router.get('/reports/discrepancies', getDiscrepancies);

// Báo cáo / cấu hình
router.get('/reports/summary', getReportSummary);
router.get('/reports/export', exportReport);
router.get('/settings', getFinanceSettings);
router.put('/settings', updateFinanceSettings);

module.exports = router;
