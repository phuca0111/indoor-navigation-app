// Phase 5.7 — Billing self-service routes (mock đã thay bằng TPTPpay 5.8)
// WL2: GET /plans public cho Landing; các route khác vẫn cần auth
const express = require('express');
const router = express.Router();
const { auth, requireAdmin } = require('../middlewares/auth');
const {
  listPublicPlans,
  getMyBilling,
  postCheckout
} = require('../controllers/billingController');

router.get('/plans', listPublicPlans);

router.use(auth);

router.get('/me', requireAdmin, getMyBilling);
router.post('/checkout', requireAdmin, postCheckout);

module.exports = router;
