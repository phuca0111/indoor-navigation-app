// ============================================
// FILE: organizationRoutes.js
// MỤC ĐÍCH: Định nghĩa routes cho Organization
// ============================================

const express = require('express');
const router = express.Router();
const { listOrganizations, createWithAdmin } = require('../controllers/organizationController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

// Tất cả routes organization đều yêu cầu xác thực
router.use(auth);

// GET /api/organizations?active=true&with_counts=true
router.get('/', listOrganizations);

// POST /api/organizations/with-admin — Super Admin tạo org + ORG_ADMIN (2.7)
router.post('/with-admin', requireSuperAdmin, createWithAdmin);

module.exports = router;
