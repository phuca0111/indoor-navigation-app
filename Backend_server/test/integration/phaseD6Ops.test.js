const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');

describe('D6 — Health, readiness và metrics', () => {
  beforeAll(async () => {
    require('dotenv').config();
    const uri =
      process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
  });

  test('readiness phản ánh kết nối DB', async () => {
    const response = await request(app).get('/api/ready');
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
  });

  test('metrics xuất Prometheus text và ghi nhận request', async () => {
    await request(app).get('/api/ready');
    const response = await request(app).get('/api/metrics');
    expect(response.status).toBe(200);
    expect(response.text).toContain('indoor_nav_http_requests_total');
    expect(response.text).toContain('indoor_nav_process_uptime_seconds');
  });

  test('health trả snapshot hệ thống', async () => {
    const response = await request(app).get('/api/health');
    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('db');
    expect(response.body).toHaveProperty('memory');
  });
});
