const { buildSystemHealth } = require('../services/systemHealthService');
const { renderMetrics, setOperationalMetrics } = require('../services/metricsService');

async function health(req, res) {
  const snapshot = await buildSystemHealth();
  res.status(snapshot.status === 'critical' ? 503 : 200).json({
    ...snapshot,
    checks: {
      mongo: snapshot.db.ok,
      redis: snapshot.redis.ok,
      storage: snapshot.object_storage.ok,
      worker: snapshot.worker_queue.ok
    }
  });
}

function liveness(req, res) {
  res.status(200).json({ live: true, uptime_sec: Math.round(process.uptime()) });
}

async function readiness(req, res) {
  const snapshot = await buildSystemHealth();
  const ready = snapshot.db.ok
    && (!snapshot.redis.configured || snapshot.redis.ok)
    && snapshot.object_storage.ok
    && snapshot.worker_queue.ok;
  res.status(ready ? 200 : 503).json({
    ready,
    checks: {
      mongo: snapshot.db.ok,
      redis: snapshot.redis.ok,
      storage: snapshot.object_storage.ok,
      worker: snapshot.worker_queue.ok
    }
  });
}

async function metrics(req, res) {
  const required = process.env.METRICS_TOKEN;
  if (required && req.get('Authorization') !== `Bearer ${required}`) {
    return res.status(401).send('Unauthorized\n');
  }
  const snapshot = await buildSystemHealth();
  setOperationalMetrics(snapshot);
  res.type('text/plain; version=0.0.4').send(renderMetrics());
}

module.exports = { health, liveness, readiness, metrics };
