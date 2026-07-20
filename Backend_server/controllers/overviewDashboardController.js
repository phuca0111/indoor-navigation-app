const { buildOverviewDashboard } = require('../services/overviewDashboardService');

const getOverviewDashboard = async (req, res) => {
  try {
    const data = await buildOverviewDashboard({
      user: req.user,
      range: req.query.range || '30d',
      from: req.query.from,
      to: req.query.to,
      subscription_range: req.query.subscription_range || req.query.sub_range,
      subscription_from: req.query.subscription_from || req.query.sub_from,
      subscription_to: req.query.subscription_to || req.query.sub_to
    });
    return res.status(200).json(data);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      message: status === 500 ? ('Lỗi máy chủ: ' + error.message) : error.message
    });
  }
};

module.exports = { getOverviewDashboard };
