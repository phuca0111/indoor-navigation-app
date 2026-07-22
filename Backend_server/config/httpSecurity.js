const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5000',
  'http://localhost:3000',
  'http://127.0.0.1:5000'
];

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isValidOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol)
      && url.origin === origin
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function getCorsOptions(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const configuredOrigins = parseOrigins(env.CORS_ORIGIN);
  const origins = configuredOrigins.length ? configuredOrigins : DEFAULT_CORS_ORIGINS;

  if (isProduction) {
    if (!configuredOrigins.length) {
      throw new Error('CORS_ORIGIN là bắt buộc trong production.');
    }
    if (origins.some((origin) => origin.includes('*') || !isValidOrigin(origin))) {
      throw new Error('CORS_ORIGIN production phải là danh sách origin HTTP(S) hợp lệ, không dùng wildcard.');
    }
  }

  return {
    origin: origins,
    credentials: true
  };
}

const CSP_REPORT_ONLY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' http: https: ws: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  'report-uri /api/csp-report'
].join('; ');

function cspReportOnly(req, res, next) {
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY_POLICY);
  next();
}

module.exports = {
  DEFAULT_CORS_ORIGINS,
  CSP_REPORT_ONLY_POLICY,
  getCorsOptions,
  isValidOrigin,
  cspReportOnly
};
