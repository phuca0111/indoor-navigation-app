function errorPayload(req, code, message, details = null) {
  const error = {
    code,
    message,
    request_id: req.requestId,
    details
  };
  return { error };
}

function apiNotFound(req, res, next) {
  if (req.path !== '/api' && !req.path.startsWith('/api/')) return next();
  return res.status(404).json(errorPayload(
    req,
    'API_NOT_FOUND',
    'Không tìm thấy API được yêu cầu.'
  ));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json(errorPayload(
      req,
      'PAYLOAD_TOO_LARGE',
      'Dữ liệu gửi lên vượt giới hạn cho phép.'
    ));
  }

  if (err instanceof SyntaxError && err?.status === 400 && 'body' in err) {
    return res.status(400).json(errorPayload(
      req,
      'INVALID_JSON',
      'Nội dung JSON không hợp lệ.'
    ));
  }

  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;
  const expose = status < 500 || process.env.NODE_ENV !== 'production';
  return res.status(status).json(errorPayload(
    req,
    err?.code || (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    expose && err?.message ? err.message : 'Đã xảy ra lỗi máy chủ.'
  ));
}

module.exports = { apiNotFound, errorHandler, errorPayload };
