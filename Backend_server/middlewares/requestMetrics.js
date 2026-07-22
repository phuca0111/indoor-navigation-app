const { observeRequest } = require('../services/metricsService');

function requestMetrics(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
    observeRequest(req, res, elapsed);
  });
  next();
}

module.exports = { requestMetrics };
