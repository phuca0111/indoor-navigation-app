const crypto = require('crypto');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function validRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

function requestContext(req, res, next) {
  const provided = req.get('x-request-id');
  const requestId = validRequestId(provided) ? provided : crypto.randomUUID();
  const providedCorrelationId = req.get('x-correlation-id');
  const correlationId = validRequestId(providedCorrelationId)
    ? providedCorrelationId
    : requestId;

  req.requestId = requestId;
  req.context = {
    ...(req.context || {}),
    requestId,
    correlationId
  };
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Correlation-ID', correlationId);
  next();
}

module.exports = { REQUEST_ID_PATTERN, requestContext, validRequestId };
