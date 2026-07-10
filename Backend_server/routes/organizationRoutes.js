// ============================================
// FILE: organizationRoutes.js
// MỤC ĐÍCH: Định nghĩa routes cho Organization
// ============================================

const express = require('express');
const router = express.Router();
const {
  listOrganizations,
  createWithAdmin,
  getOrganization,
  updateOrganization,
  createOrganizationBillingEvent,
  getOrganizationSubscription,
  activateOrganizationSubscription,
  cancelOrganizationSubscription,
  expireOrganizationSubscription
} = require('../controllers/organizationController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

// Tất cả routes organization đều yêu cầu xác thực
router.use(auth);

// GET /api/organizations?active=true&with_counts=true
router.get('/', listOrganizations);

// POST /api/organizations/with-admin — Super Admin tạo org + ORG_ADMIN (2.7)
router.post('/with-admin', requireSuperAdmin, createWithAdmin);

// Subscription lifecycle (đặt trước /:id để tránh xung đột route nếu cần)
router.get('/:id/subscription', requireSuperAdmin, getOrganizationSubscription);
router.post('/:id/subscription/activate', requireSuperAdmin, activateOrganizationSubscription);
router.post('/:id/subscription/cancel', requireSuperAdmin, cancelOrganizationSubscription);
router.post('/:id/subscription/expire', requireSuperAdmin, expireOrganizationSubscription);
router.post('/:id/billing-events', requireSuperAdmin, createOrganizationBillingEvent);

// GET /api/organizations/:id — Super Admin: chi tiết tổ chức (Phase 4.1)
router.get('/:id', requireSuperAdmin, getOrganization);

// PATCH /api/organizations/:id — Super Admin: plan, is_active (Phase 4.1a)
router.patch('/:id', requireSuperAdmin, updateOrganization);

module.exports = router;
