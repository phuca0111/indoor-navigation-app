const { writeJsonLog } = require('../utils/structuredLogger');

function loggingEnabled(env = process.env) {
  if (env.REQUEST_LOG_ENABLED === 'false') return false;
  if (env.NODE_ENV === 'test') return env.REQUEST_LOG_ENABLED === 'true';
  return true;
}

function requestLogger(req, res, next) {
  if (!loggingEnabled()) return next();

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    writeJsonLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'http_request',
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      route: req.route?.path || null,
      status: res.statusCode,
      latency_ms: Number(latencyMs.toFixed(3)),
      request_id: req.requestId,
      correlation_id: req.context?.correlationId || req.requestId
    });
  });
  next();
}

module.exports = { loggingEnabled, requestLogger };
