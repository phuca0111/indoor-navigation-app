// ============================================
// FILE: rateLimit.js
// MỤC ĐÍCH: Cấu hình rate limit cho các endpoint auth public
// WHY: Chống brute force login, spam register, token flood abuse
// ============================================

const rateLimit = require('express-rate-limit');

// Login: 5 lần thử / 15 phút / IP
// skipSuccessfulRequests: không tính các request thành công (không block user đăng nhập đúng)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' }
});

// Public register: 3 lần / 1 giờ / IP
const publicRegisterLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Bạn đã đạt giới hạn đăng ký. Vui lòng thử lại sau 1 giờ.' }
});

// Refresh token: 10 lần / 15 phút / IP
const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Quá nhiều yêu cầu refresh token. Vui lòng thử lại sau.' }
});

// Forgot / reset password: 5 / 15 phút / IP
// skip khi Jest — suite Phase 7 gọi nhiều lần cùng IP
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !!process.env.JEST_WORKER_ID,
    message: { message: 'Quá nhiều yêu cầu quên mật khẩu. Vui lòng thử lại sau 15 phút.' }
});

const resetPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !!process.env.JEST_WORKER_ID,
    message: { message: 'Quá nhiều lần đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.' }
});

module.exports = {
    loginLimiter,
    publicRegisterLimiter,
    refreshLimiter,
    forgotPasswordLimiter,
    resetPasswordLimiter
};
