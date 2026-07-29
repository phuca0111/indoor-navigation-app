const stats = require('../application/mapLifecycle/mapManagementStatsApplicationService');

async function getStats(req, res) {
  try {
    const result = await stats.getMapManagementStats();
    return res.status(result.status || 200).json(result.body);
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.status ? error.message : `Lỗi máy chủ: ${error.message}`,
      ...(error.code ? { code: error.code } : {})
    });
  }
}

module.exports = { getStats };
