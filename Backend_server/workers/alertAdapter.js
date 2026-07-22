'use strict';

const http = require('http');
const https = require('https');
const { writeJsonLog } = require('../utils/structuredLogger');

const port = Number(process.env.ALERT_ADAPTER_PORT) || 8080;
const maxBytes = 256 * 1024;

function forward(payload) {
  const target = String(process.env.ALERT_PROVIDER_WEBHOOK_URL || '').trim();
  if (!target) return Promise.resolve({ deferred: true });
  const url = new URL(target);
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    return Promise.reject(new Error('Production alert provider webhook must use HTTPS.'));
  }
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': payload.length },
      timeout: 5000
    }, (response) => {
      response.resume();
      if (response.statusCode >= 200 && response.statusCode < 300) resolve({ sent: true });
      else reject(new Error(`Alert provider returned ${response.statusCode}`));
    });
    request.on('timeout', () => request.destroy(new Error('Alert provider timeout')));
    request.on('error', reject);
    request.end(payload);
  });
}

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200).end('ok\n');
    return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/alertmanager') {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  let bytes = 0;
  request.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > maxBytes) request.destroy();
    else chunks.push(chunk);
  });
  request.on('end', async () => {
    try {
      const payload = Buffer.concat(chunks);
      const parsed = JSON.parse(payload.toString('utf8'));
      const result = await forward(payload);
      writeJsonLog({
        timestamp: new Date().toISOString(),
        level: result.deferred ? 'warn' : 'info',
        event: 'alert_adapter',
        status: parsed.status,
        alert_count: Array.isArray(parsed.alerts) ? parsed.alerts.length : 0,
        provider: result.deferred ? 'deferred' : 'configured'
      });
      response.writeHead(result.deferred ? 202 : 200).end();
    } catch (error) {
      writeJsonLog({ timestamp: new Date().toISOString(), level: 'error', event: 'alert_adapter_error', message: error.message });
      response.writeHead(502).end();
    }
  });
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
server.listen(port, '0.0.0.0');
