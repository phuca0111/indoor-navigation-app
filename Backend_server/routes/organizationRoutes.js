// ============================================
// FILE: organizationRoutes.js
// MỤC ĐÍCH: Định nghĩa routes cho Organization
// ============================================

const express = require('express');
const router = express.Router();
const { listOrganizations } = require('../controllers/organizationController');
const { auth } = require('../middlewares/auth');

// Tất cả routes organization đều yêu cầu xác thực
router.use(auth);

// GET /api/organizations
// Query params: ?active=true (optional) - chỉ trả về active organizations
router.get('/', listOrganizations);

module.exports = router;
