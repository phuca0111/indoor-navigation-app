const jwt = require('jsonwebtoken');
const { isEnabled } = require('../services/featureFlagService');

async function maintenanceMode(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path === '/api/health' || req.path.startsWith('/api/auth/')) return next();
  let isSuperAdmin = false;
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      isSuperAdmin = payload.role === 'SUPER_ADMIN';
    } catch (_) { /* auth middleware xử lý ở route */ }
  }
  if (isSuperAdmin || req.path.startsWith('/api/feature-flags')) return next();
  if (await isEnabled('maintenance_mode')) {
    return res.status(503).json({
      message: 'Hệ thống đang bảo trì. Vui lòng thử lại sau.',
      code: 'MAINTENANCE_MODE'
    });
  }
  return next();
}

module.exports = { maintenanceMode };
