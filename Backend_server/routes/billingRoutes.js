// Phase 5.7 — Billing self-service routes (mock đã thay bằng TPTPpay 5.8)
// WL2: GET /plans public cho Landing; các route khác vẫn cần auth
const express = require('express');
const router = express.Router();
const { auth, requireAdmin } = require('../middlewares/auth');
const {
  listPublicPlans,
  getMyBilling,
  postCheckout,
  getPersonalBilling,
  personalUpgrade,
  personalCheckout,
  personalCheckoutActive,
  personalCheckoutStatus,
  getCheckoutStatus
} = require('../controllers/billingController');

router.get('/plans', listPublicPlans);

router.use(auth);

router.get('/me', requireAdmin, getMyBilling);
router.post('/checkout', requireAdmin, postCheckout);
router.get('/checkout/:invoiceId/status', requireAdmin, getCheckoutStatus);

// Gói cá nhân (REGISTERED_USER) — không dùng requireAdmin
router.get('/personal/me', getPersonalBilling);
router.post('/personal/upgrade', personalUpgrade);
router.get('/personal/checkout/active', personalCheckoutActive);
router.post('/personal/checkout', personalCheckout);
router.get('/personal/checkout/:id/status', personalCheckoutStatus);

module.exports = router;
