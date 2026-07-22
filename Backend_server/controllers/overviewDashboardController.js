const { getOverviewDashboard } = require('../application/read/dashboardQueryService');

const getOverviewDashboardHttp = async (req, res) => {
  try {
    const data = await getOverviewDashboard({
      user: req.user,
      range: req.query.range || '1m',
      from: req.query.from,
      to: req.query.to,
      subscription_range: req.query.subscription_range || req.query.sub_range,
      subscription_from: req.query.subscription_from || req.query.sub_from,
      subscription_to: req.query.subscription_to || req.query.sub_to,
      org_growth_mode: req.query.org_growth_mode
    });
    return res.status(200).json(data);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      message: status === 500 ? ('Lỗi máy chủ: ' + error.message) : error.message
    });
  }
};

module.exports = { getOverviewDashboard: getOverviewDashboardHttp };
