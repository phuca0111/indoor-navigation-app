// Phase 5.8 — TPTPpay cổng thanh toán ảo
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { getPayPage, getPaymentStatus, getBankLink, getPersonalPayPage } = require('../controllers/tptpPayController');

const payLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: 'Quá nhiều yêu cầu thanh toán.' }
});

router.get('/pay/:invoiceId', payLimiter, getPayPage);
router.get('/personal/:id', payLimiter, getPersonalPayPage);
router.get('/status/:invoiceId', payLimiter, getPaymentStatus);
router.get('/bank-link', payLimiter, getBankLink);

module.exports = router;
