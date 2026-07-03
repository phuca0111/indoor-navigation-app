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
const { auth, requireSuperAdmin } = require('../middlewares/auth');
const { publicRegisterLimiter } = require('../middlewares/rateLimit');

router.post('/public', publicRegisterLimiter, submitPublicRegistration);
router.post('/self-service', publicRegisterLimiter, submitSelfServiceTrial);

router.get('/', auth, requireSuperAdmin, listRegistrations);
router.post('/:id/approve', auth, requireSuperAdmin, approveRegistration);
router.post('/:id/reject', auth, requireSuperAdmin, rejectRegistration);

module.exports = router;
