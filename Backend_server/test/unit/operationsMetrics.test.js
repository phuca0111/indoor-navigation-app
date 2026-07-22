const {
  observeRequest,
  setOperationalMetrics,
  renderMetrics
} = require('../../services/metricsService');

describe('operations Prometheus metrics', () => {
  test('renders histogram and dependency/queue gauges without secrets', () => {
    observeRequest(
      { method: 'GET', route: { path: '/api/items/:id' }, path: '/api/items/abc' },
      { statusCode: 200 },
      0.2
    );
    setOperationalMetrics({
      db: { ok: true },
      redis: { ok: true },
      object_storage: { ok: false },
      worker_queue: { ok: true, waiting: 7, failed: 1 }
    });
    const output = renderMetrics();
    expect(output).toContain('# TYPE indoor_nav_http_request_duration_seconds histogram');
    expect(output).toContain('indoor_nav_http_request_duration_seconds_bucket');
    expect(output).toContain('indoor_nav_dependency_storage_up 0');
    expect(output).toContain('indoor_nav_worker_queue_backlog 7');
    expect(output).toContain('indoor_nav_worker_queue_failed 1');
    expect(output).not.toMatch(/password|secret|token/i);
  });
});
