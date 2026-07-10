// Phase 5.7 — Billing self-service routes (mock đã thay bằng TPTPpay 5.8)
const express = require('express');
const router = express.Router();
const { auth, requireAdmin } = require('../middlewares/auth');
const { getMyBilling, postCheckout } = require('../controllers/billingController');

router.use(auth);

router.get('/me', requireAdmin, getMyBilling);
router.post('/checkout', requireAdmin, postCheckout);

module.exports = router;
