// ============================================
// FILE: orgRegistrationRoutes.js
// MỤC ĐÍCH: Routes đăng ký tổ chức (public + Super Admin duyệt)
// ============================================

const express = require('express');
const router = express.Router();
const {
  submitPublicRegistration,
  submitSelfServiceTrial,
  listRegistrations,
  approveRegistration,
  rejectRegistration
} = require('../controllers/orgRegistrationController');
const { auth, requirePermission, P } = require('../middlewares/auth');
const { publicRegisterLimiter } = require('../middlewares/rateLimit');

router.post('/public', publicRegisterLimiter, submitPublicRegistration);
router.post('/self-service', publicRegisterLimiter, submitSelfServiceTrial);

router.get('/', auth, requirePermission(P.PLATFORM_REGISTRATIONS_MANAGE), listRegistrations);
router.post('/:id/approve', auth, requirePermission(P.PLATFORM_REGISTRATIONS_MANAGE), approveRegistration);
router.post('/:id/reject', auth, requirePermission(P.PLATFORM_REGISTRATIONS_MANAGE), rejectRegistration);

module.exports = router;
