jest.mock('../../services/featureFlagService', () => ({
  isEnabled: jest.fn().mockResolvedValue(false)
}));

const request = require('supertest');
const { createApp, usesLargeMapBody } = require('../../app');
const { getCorsOptions } = require('../../config/httpSecurity');
const { redact } = require('../../utils/structuredLogger');

describe('backend foundation (không DB)', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  test('giữ request id hợp lệ và trả lại qua header/context', async () => {
    const response = await request(app)
      .get('/api/auth/google/status')
      .set('X-Request-ID', 'client.request-123');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('client.request-123');
  });

  test('sinh UUID khi request id không hợp lệ', async () => {
    const response = await request(app)
      .get('/api/auth/google/status')
      .set('X-Request-ID', 'bad id with spaces');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test('alias v1 và legacy dùng cùng auth route', async () => {
    const [legacy, v1] = await Promise.all([
      request(app).get('/api/auth/google/status'),
      request(app).get('/api/v1/auth/google/status')
    ]);

    expect(v1.status).toBe(legacy.status);
    expect(v1.body).toEqual(legacy.body);
  });

  test('validation v1 chặn login và search không hợp lệ trước controller', async () => {
    const [login, search] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ email: 'sai', password: '' }),
      request(app).get('/api/v1/search?q=x')
    ]);

    expect(login.status).toBe(400);
    expect(login.body.error.code).toBe('VALIDATION_ERROR');
    expect(search.status).toBe(400);
    expect(search.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('API 404, JSON sai và body quá lớn có error envelope', async () => {
    const notFound = await request(app).get('/api/khong-ton-tai');
    const malformed = await request(app)
      .post('/api/khong-ton-tai')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    const tooLarge = await request(app)
      .post('/api/khong-ton-tai')
      .send({ value: 'x'.repeat(1024 * 1024 + 1) });

    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toMatchObject({
      code: 'API_NOT_FOUND',
      request_id: expect.any(String)
    });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('CSP report-only có trên UI và endpoint nhận report', async () => {
    const page = await request(app).get('/login/');
    const report = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src' } }));

    expect(page.headers['content-security-policy-report-only']).toContain(
      'report-uri /api/csp-report'
    );
    expect(page.headers['content-security-policy']).toBeUndefined();
    expect(report.status).toBe(204);
  });

  test('CORS production fail-fast và development giữ defaults', () => {
    expect(() => getCorsOptions({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGIN/);
    expect(() => getCorsOptions({
      NODE_ENV: 'production',
      CORS_ORIGIN: '*'
    })).toThrow(/wildcard/);
    expect(getCorsOptions({ NODE_ENV: 'development' }).origin).toContain(
      'http://localhost:5000'
    );
  });

  test('redact bí mật lồng nhau và nhận diện map body lớn đúng route', () => {
    expect(redact({
      authorization: 'Bearer secret',
      profile: { password: 'secret', refreshToken: 'secret', safe: 'ok' }
    })).toEqual({
      authorization: '[REDACTED]',
      profile: {
        password: '[REDACTED]',
        refreshToken: '[REDACTED]',
        safe: 'ok'
      }
    });

    expect(usesLargeMapBody({
      path: '/api/v1/buildings/b1/floors/1/draft'
    })).toBe(true);
    expect(usesLargeMapBody({ path: '/api/auth/login' })).toBe(false);
  });
});
