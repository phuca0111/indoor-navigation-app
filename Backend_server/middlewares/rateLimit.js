// ============================================
// FILE: rateLimit.js
// MỤC ĐÍCH: Rate limit auth public — Redis store khi có REDIS_URL (C3)
// ============================================

const rateLimit = require('express-rate-limit');
const { createHybridStore } = require('../services/rateLimitStore');

function makeLimiter(opts) {
  const { prefix, windowMs, ...rest } = opts;
  return rateLimit({
    ...rest,
    windowMs,
    store: createHybridStore(prefix || 'rl:', windowMs)
  });
}

const loginLimiter = makeLimiter({
  prefix: 'rl:login:',
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' }
});

const publicRegisterLimiter = makeLimiter({
  prefix: 'rl:register:',
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Bạn đã đạt giới hạn đăng ký. Vui lòng thử lại sau 1 giờ.' }
});

const refreshLimiter = makeLimiter({
  prefix: 'rl:refresh:',
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Quá nhiều yêu cầu refresh token. Vui lòng thử lại sau.' }
});

const forgotPasswordLimiter = makeLimiter({
  prefix: 'rl:forgot:',
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !!process.env.JEST_WORKER_ID,
  message: { message: 'Quá nhiều yêu cầu quên mật khẩu. Vui lòng thử lại sau 15 phút.' }
});

const resetPasswordLimiter = makeLimiter({
  prefix: 'rl:reset:',
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !!process.env.JEST_WORKER_ID,
  message: { message: 'Quá nhiều lần đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.' }
});

const publishLimiter = makeLimiter({
  prefix: 'rl:publish:',
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () =>
    !!process.env.JEST_WORKER_ID && process.env.FORCE_PUBLISH_RATE_LIMIT !== 'true',
  keyGenerator: (req) => {
    if (req.user?.userId) return String(req.user.userId);
    return req.ip || 'unknown';
  },
  validate: { keyGeneratorIpFallback: false },
  message: {
    message: 'Quá nhiều lần xuất bản. Vui lòng thử lại sau 15 phút.',
    code: 'PUBLISH_RATE_LIMIT'
  }
});

const contactLimiter = makeLimiter({
  prefix: 'rl:contact:',
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !!process.env.JEST_WORKER_ID,
  message: { message: 'Bạn đã gửi quá nhiều liên hệ. Vui lòng thử lại sau 1 giờ.' }
});

module.exports = {
  loginLimiter,
  publicRegisterLimiter,
  refreshLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  publishLimiter,
  contactLimiter
};
