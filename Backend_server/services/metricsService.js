const counters = new Map();
const durations = new Map();
const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
let operational = null;

function normalizeRoute(req) {
  return String(req.route?.path || req.path || '/unknown')
    .replace(/[a-f0-9]{24}/gi, ':id')
    .replace(/\d+/g, ':n');
}

function observeRequest(req, res, elapsedSeconds) {
  const route = normalizeRoute(req);
  const labels = `${req.method}|${route}|${res.statusCode}`;
  counters.set(labels, (counters.get(labels) || 0) + 1);
  const durationKey = `${req.method}|${route}`;
  const current = durations.get(durationKey) || {
    count: 0,
    sum: 0,
    buckets: BUCKETS.map(() => 0)
  };
  current.count += 1;
  current.sum += elapsedSeconds;
  BUCKETS.forEach((bucket, index) => {
    if (elapsedSeconds <= bucket) current.buckets[index] += 1;
  });
  durations.set(durationKey, current);
}

function setOperationalMetrics(snapshot) {
  operational = snapshot;
}

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function renderMetrics() {
  const lines = [
    '# HELP indoor_nav_http_requests_total Total HTTP requests.',
    '# TYPE indoor_nav_http_requests_total counter'
  ];
  for (const [key, value] of counters) {
    const [method, route, status] = key.split('|');
    lines.push(
      `indoor_nav_http_requests_total{method="${method}",route="${escapeLabel(route)}",status="${status}"} ${value}`
    );
  }
  lines.push(
    '# HELP indoor_nav_http_request_duration_seconds HTTP request duration.',
    '# TYPE indoor_nav_http_request_duration_seconds histogram'
  );
  for (const [key, value] of durations) {
    const [method, route] = key.split('|');
    const labels = `method="${method}",route="${escapeLabel(route)}"`;
    BUCKETS.forEach((bucket, index) => {
      lines.push(`indoor_nav_http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${value.buckets[index]}`);
    });
    lines.push(`indoor_nav_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${value.count}`);
    lines.push(`indoor_nav_http_request_duration_seconds_count{${labels}} ${value.count}`);
    lines.push(`indoor_nav_http_request_duration_seconds_sum{${labels}} ${value.sum}`);
  }
  if (operational) {
    const gauge = (name, help, value) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${Number(value || 0)}`);
    };
    gauge('indoor_nav_dependency_mongo_up', 'MongoDB connectivity status.', operational.db.ok ? 1 : 0);
    gauge('indoor_nav_dependency_redis_up', 'Redis connectivity status.', operational.redis.ok ? 1 : 0);
    gauge('indoor_nav_dependency_storage_up', 'Object storage connectivity status.', operational.object_storage.ok ? 1 : 0);
    gauge('indoor_nav_worker_queue_up', 'Publish worker queue connectivity status.', operational.worker_queue.ok ? 1 : 0);
    gauge('indoor_nav_worker_queue_backlog', 'Publish jobs waiting or delayed.', operational.worker_queue.waiting);
    gauge('indoor_nav_worker_queue_failed', 'Publish jobs in failed state.', operational.worker_queue.failed);
  }
  lines.push(
    '# HELP indoor_nav_process_uptime_seconds Process uptime in seconds.',
    '# TYPE indoor_nav_process_uptime_seconds gauge',
    `indoor_nav_process_uptime_seconds ${process.uptime()}`,
    '# HELP indoor_nav_process_resident_memory_bytes Process resident memory in bytes.',
    '# TYPE indoor_nav_process_resident_memory_bytes gauge',
    `indoor_nav_process_resident_memory_bytes ${process.memoryUsage().rss}`
  );
  return `${lines.join('\n')}\n`;
}

module.exports = { observeRequest, renderMetrics, setOperationalMetrics };
