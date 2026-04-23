// ============================================
// FILE: qrRoutes.js
// MỤC ĐÍCH: Định tuyến API tra cứu mã QR
// PUBLIC — Android không cần đăng nhập
// ============================================

const express = require('express');
const router = express.Router();
const { getQrInfo } = require('../controllers/qrController');

// GET /api/qr/:qrCode
// Android scan QR → gửi giá trị qrCode lên → nhận về thông tin vị trí
router.get('/:qrCode', getQrInfo);

module.exports = router;
