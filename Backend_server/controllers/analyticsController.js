// Phase 6 — Analytics API
const {
  resolveOrgScope,
  buildOverview,
  buildAlerts,
  buildTimeseries
} = require('../services/analyticsService');

async function getOverview(req, res) {
  try {
    const scope = await resolveOrgScope(req);
    const data = await buildOverview({
      role: scope.role,
      orgId: scope.orgId,
      range: req.query.range
    });
    res.json(data);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('analytics overview:', e);
    res.status(status).json({ message: e.message || 'Lỗi analytics.' });
  }
}

async function getAlerts(req, res) {
  try {
    const scope = await resolveOrgScope(req);
    const data = await buildAlerts({ role: scope.role, orgId: scope.orgId });
    res.json(data);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('analytics alerts:', e);
    res.status(status).json({ message: e.message || 'Lỗi analytics.' });
  }
}

async function getTimeseries(req, res) {
  try {
    const scope = await resolveOrgScope(req);
    const data = await buildTimeseries({
      role: scope.role,
      orgId: scope.orgId,
      metric: req.query.metric,
      range: req.query.range
    });
    res.json(data);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('analytics timeseries:', e);
    res.status(status).json({ message: e.message || 'Lỗi analytics.' });
  }
}

module.exports = {
  getOverview,
  getAlerts,
  getTimeseries
};
