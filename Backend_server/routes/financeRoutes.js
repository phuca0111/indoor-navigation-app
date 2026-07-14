// Phase 9 — /api/finance (Super Admin)
const express = require('express');
const router = express.Router();
const { auth, requireSuperAdmin } = require('../middlewares/auth');
const {
  getOverview,
  listBillingOrgs,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense
} = require('../controllers/financeController');

router.use(auth);
router.use(requireSuperAdmin);

router.get('/overview', getOverview);
router.get('/orgs', listBillingOrgs);
router.get('/expenses', listExpenses);
router.post('/expenses', createExpense);
router.patch('/expenses/:id', updateExpense);
router.delete('/expenses/:id', deleteExpense);

module.exports = router;
