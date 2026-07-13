// ============================================
// FILE: authRoutes.js
// MỤC ĐÍCH: TẤM BIỂN BÁO CHỈ ĐƯỜNG cho các link URL đăng nhập/đăng ký
// ============================================

const express = require('express');
const router = express.Router();

const {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  unlockSession,
  registerPublic,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
const { auth, requireAdmin } = require('../middlewares/auth');
const {
  loginLimiter,
  publicRegisterLimiter,
  refreshLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter
} = require('../middlewares/rateLimit');

router.post('/login', loginLimiter, login);
router.post('/register', auth, requireAdmin, register);
router.post('/public-register', publicRegisterLimiter, registerPublic);
router.post('/refresh', refreshLimiter, refresh);
router.post('/logout', logout);
router.post('/logout-all', auth, logoutAll);
router.post('/unlock-session', auth, unlockSession);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);

module.exports = router;
