const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|session|connection[-_]?string|mongo_uri|redis_url)/i;

function redact(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, seen);
  }
  return output;
}

function writeJsonLog(record, output = console.log) {
  output(JSON.stringify(redact(record)));
}

module.exports = { redact, writeJsonLog };
