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
  adminResetPassword,
  getUserOverview,
  getUserFavorites,
  getUserHistory,
  getUserSessions,
  getUserDevices,
  putMyEmergencyConsent,
  getMyEmergencyConsent,
  putMyDevice,
  getMyDevices,
  deleteMyDevice,
  putMyPresence,
  postUserWarning,
  postUserBan,
  postUserUnban
} = require('../controllers/userController');
const { auth, requireAdmin, requirePermission, requireAnyPermission, P } = require('../middlewares/auth');
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

// P2.1 — Emergency consent + Device registry (self)
router.get('/me/emergency-consent', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), getMyEmergencyConsent);
router.put('/me/emergency-consent', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), putMyEmergencyConsent);
router.get('/me/devices', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), getMyDevices);
router.put('/me/devices', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), putMyDevice);
router.put('/me/presence', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), putMyPresence);
router.delete('/me/devices/:deviceId', auth, requirePermission(P.IDENTITY_PROFILE_WRITE), deleteMyDevice);

// Admin routes: Super Admin toàn hệ thống, Org Admin trong org (2.6)
// P2.1 RBAC: requireAdmin = PLATFORM_USERS_MANAGE | ORG_USERS_MANAGE (BUILDING_ADMIN bị chặn)
router.use(auth, requireAdmin);

router.get('/', getUsers);
router.put('/:userId/reset-password', adminResetPassword);
// Chi tiết per-user (Admin) — đặt trước GET /:userId
router.get('/:userId/overview', getUserOverview);
router.get('/:userId/favorites', getUserFavorites);
router.get('/:userId/history', getUserHistory);
router.get('/:userId/sessions', getUserSessions);
router.get('/:userId/devices', getUserDevices);
router.post(
  '/:userId/warnings',
  requireAnyPermission(P.PLATFORM_USERS_MANAGE, P.ORG_USERS_MANAGE),
  postUserWarning
);
router.post(
  '/:userId/ban',
  requireAnyPermission(P.PLATFORM_USERS_MANAGE, P.ORG_USERS_MANAGE),
  postUserBan
);
router.post(
  '/:userId/unban',
  requireAnyPermission(P.PLATFORM_USERS_MANAGE, P.ORG_USERS_MANAGE),
  postUserUnban
);
router.get('/:userId', getUserById);
router.put('/:userId', updateUser);

module.exports = router;
