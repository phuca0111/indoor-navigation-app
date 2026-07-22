module.exports = async function globalProviderSetup() {
  if (process.env.REDIS_URL) return;
  const { RedisMemoryServer } = require('redis-memory-server');
  const server = new RedisMemoryServer();
  const [host, port] = await Promise.all([
    server.getHost(),
    server.getPort()
  ]);
  global.__TARGET_ARCHITECTURE_REDIS__ = server;
  process.env.REDIS_URL = `redis://${host}:${port}`;
};
