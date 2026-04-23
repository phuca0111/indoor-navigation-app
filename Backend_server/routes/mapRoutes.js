// ============================================
// FILE: mapRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Bản đồ
// ============================================

const express = require('express');
const router = express.Router();

const { saveMap, loadMap, downloadMap } = require('../controllers/mapController');
const { auth } = require('../middlewares/auth');

// Đường 1: Web Editor lưu bản đồ lên Server (Phải đăng nhập)
// URL: POST /api/maps/:buildingId/:floor/publish
router.post('/:buildingId/:floor/publish', auth, saveMap);

// Đường 2: Web Editor tải bản đồ về sửa tiếp (Phải đăng nhập)
// URL: GET /api/maps/:buildingId/:floor
router.get('/:buildingId/:floor', auth, loadMap);

// Đường 2.1: App Android tải bản đồ từng tầng (Public - Không cần đăng nhập)
router.get('/:buildingId/:floor/public', loadMap);

// Đường 3: App Android tải toàn bộ bản đồ offline (Không cần đăng nhập)
// URL: GET /api/maps/:buildingId/download
router.get('/:buildingId/download', downloadMap);

module.exports = router;
