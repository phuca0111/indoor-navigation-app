// ============================================
// FILE: ipHelper.js
// MỤC ĐÍCH: Helper chuẩn hóa địa chỉ IP từ request
// ============================================

/**
 * Lấy IP chuẩn từ request, normalize localhost variants
 * Ưu tiên: x-forwarded-for (đầu tiên) → req.ip → remoteAddress
 */
function getClientIp(req) {
  // X-Forwarded-For: proxy/load balancer có thể gửi nhiều IP, lấy IP đầu tiên (client thực)
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ip = xForwardedFor.split(',')[0].trim();
    if (ip) return normalizeIp(ip);
  }

  // Express có thể đã set req.ip (dựa trên trust proxy)
  const ip = req.ip || req.connection?.remoteAddress || '';
  return normalizeIp(ip);
}

/**
 * Normalize IP: chuyển localhost variants thành 'localhost'
 */
function normalizeIp(ip) {
  if (!ip) return '';
  // IPv6 localhost, IPv4 localhost, IPv4-mapped IPv6
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
    return 'localhost';
  }
  return ip;
}

module.exports = { getClientIp };
