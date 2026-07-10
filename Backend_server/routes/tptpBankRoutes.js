// Phase 5.8 — API app TPTPbank
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { bankAuth } = require('../middlewares/bankAuth');
const {
  postRegister,
  postLogin,
  getWallet,
  postTopup,
  getTransactions,
  getResolvePayment,
  postConfirmPayment,
  getTopupLimits
} = require('../controllers/tptpBankController');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: 'Quá nhiều yêu cầu. Thử lại sau.' }
});

router.post('/auth/register', authLimiter, postRegister);
router.post('/auth/login', authLimiter, postLogin);
router.get('/wallet/limits', getTopupLimits);

// Resolve QR — không cần đăng nhập (chỉ đọc thông tin đơn)
router.get('/pay/resolve', getResolvePayment);

router.use(bankAuth);
router.get('/wallet', getWallet);
router.post('/wallet/topup', postTopup);
router.get('/transactions', getTransactions);
router.post('/pay/confirm', postConfirmPayment);

module.exports = router;
