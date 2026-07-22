const {
  getOverview,
  getAlerts,
  getTimeseries,
  getConversionFunnel
} = require('../application/read/analyticsQueryService');
const { ingestTelemetryEvents } = require('../services/telemetryService');

function disableAnalyticsCache(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
}

async function getOverviewHttp(req, res) {
  try {
    disableAnalyticsCache(res);
    const data = await getOverview(req);
    res.json(data);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('analytics overview:', e);
    res.status(status).json({ message: e.message || 'Lỗi phân tích.' });
  }
}

async function getAlertsHttp(req, res) {
  try {
    disableAnalyticsCache(res);
    const data = await getAlerts(req);
    res.json(data);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('analytics alerts:', e);
    res.status(status).json({ message: e.message || 'Lỗi phân tích.' });
  }
}

async function getTimeseriesHttp(req, res) {
  try {
    disableAnalyticsCache(res);
    const data = await getTimeseries(req);
    res.json(data);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('analytics timeseries:', e);
    res.status(status).json({ message: e.message || 'Lỗi phân tích.' });
  }
}

/** POST /api/analytics/telemetry — batch ingest (JWT) */
async function postTelemetry(req, res) {
  try {
    const events = req.body?.events || req.body;
    const result = await ingestTelemetryEvents(events, {
      user_id: req.user?.userId || null,
      organization_id: req.user?.organization_id || null
    });
    res.status(201).json({ message: 'Đã ghi telemetry.', ...result });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('analytics telemetry:', e);
    res.status(status).json({
      message: e.message || 'Lỗi ghi telemetry.',
      code: e.code
    });
  }
}

async function getConversionFunnelHttp(req, res, next) {
  try {
    disableAnalyticsCache(res);
    const data = await getConversionFunnel(req);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverview: getOverviewHttp,
  getAlerts: getAlertsHttp,
  getTimeseries: getTimeseriesHttp,
  postTelemetry,
  getConversionFunnel: getConversionFunnelHttp
};
