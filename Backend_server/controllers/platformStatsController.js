/**
 * Phase 4.6 / Phase 7 — Platform stats HTTP adapter.
 * Persistence lives in platformStatsReadRepository via query service.
 */
const {
  getPlatformStatsForUser
} = require('../application/read/platformStatsQueryService');

const getPlatformStats = async (req, res) => {
  try {
    const data = await getPlatformStatsForUser(req.user);
    return res.status(200).json(data);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
    return res.status(status).json({ message: error.message });
  }
};

module.exports = { getPlatformStats };
