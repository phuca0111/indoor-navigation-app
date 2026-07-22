// ============================================
// FILE: userRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Quản lý Tài khoản (Chỉ SUPER ADMIN được vào)
// ============================================

const express = require('express');
const router = express.Router();

const {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
  changePassword,
  adminResetPassword
} = require('../controllers/userController');
const { auth, requireAdmin, requirePermission, P } = require('../middlewares/auth');
const {
  requestEmailVerification,
  confirmEmailVerification,
  requestTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  listSessions,
  revokeSession
} = require('../controllers/identityController');

// Route cho current user profile — chỉ cần auth, không phải Super Admin
router.get('/me', auth, getMe);
router.put('/me', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), updateMe);
router.put('/me/password', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), changePassword);
router.post('/me/email-verification', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), requestEmailVerification);
router.post('/me/email-verification/confirm', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), confirmEmailVerification);
router.post('/me/2fa/setup', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), requestTwoFactorSetup);
router.post('/me/2fa/confirm', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), confirmTwoFactorSetup);
router.delete('/me/2fa', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), disableTwoFactor);
router.get('/me/sessions', auth, requirePermission(P.IDENTITY_SESSION_READ), listSessions);
router.delete('/me/sessions/:sessionId', auth, requirePermission(P.IDENTITY_SESSION_REVOKE), revokeSession);

// Admin routes: Super Admin toàn hệ thống, Org Admin trong org (2.6)
router.use(auth, requireAdmin);

router.get('/', getUsers);
router.put('/:userId/reset-password', adminResetPassword);
router.get('/:userId', getUserById);
router.put('/:userId', updateUser);

module.exports = router;
