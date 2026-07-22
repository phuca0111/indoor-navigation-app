const mongoose = require('mongoose');
const connectDB = require('./config/db');

let httpServer = null;
let stopping = null;

async function startServer(app) {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('Không được bootstrap HTTP server khi NODE_ENV=test');
  }

  await connectDB();
  const {
    assertMapLifecycleProductionReady
  } = require('./config/mapLifecycleProductionGuard');
  await assertMapLifecycleProductionReady();

  const { startBillingScheduler } = require('./services/billingScheduler');
  const { startDomainEventWorker } = require('./workers/domainEventWorker');
  const { registerEventHandlers } = require('./services/registerEventHandlers');
  const { assertRequiredHandlersRegistered } = require('./shared/events/eventBus');
  const { startNotificationWorker } = require('./workers/notificationWorker');
  const { startCmsScheduler } = require('./workers/cmsScheduler');
  const { startMapLifecycleScheduler } = require('./services/mapLifecycleScheduler');
  registerEventHandlers();
  assertRequiredHandlersRegistered();
  startBillingScheduler();
  startDomainEventWorker();
  startNotificationWorker();
  startCmsScheduler();
  startMapLifecycleScheduler();
  if (String(process.env.PUBLISH_WORKER_IN_PROCESS || 'false') === 'true') {
    const { startWorker } = require('./services/publishQueueBull');
    await startWorker();
  }

  const { ensureDefaultPlans } = require('./services/planCatalog');
  const {
    ensureWebsiteConfig,
    ensureLandingPages
  } = require('./services/websiteCmsService');
  const BankUser = require('./models/BankUser');
  ensureDefaultPlans().catch((error) => console.warn('planCatalog seed:', error.message));
  ensureWebsiteConfig().catch((error) => console.warn('websiteConfig ensure:', error.message));
  ensureLandingPages().catch((error) => console.warn('LandingPage ensure:', error.message));
  BankUser.ensureBankUserIndexes().catch((error) => console.warn('BankUser indexes:', error.message));

  const port = process.env.PORT || 5000;
  const host = process.env.HOST || '0.0.0.0';
  await new Promise((resolve, reject) => {
    httpServer = app.listen(port, host, () => {
      const os = require('os');
      const lanIps = Object.values(os.networkInterfaces())
        .flat()
        .filter((network) => network && network.family === 'IPv4' && !network.internal)
        .map((network) => network.address);
      console.log('===============================================');
      console.log('🚀 BÁO CÁO: ĐỘNG CƠ MÁY CHỦ ĐÃ KHỞI CHẠY THÀNH CÔNG!');
      console.log(`🌐 Local: http://localhost:${port}`);
      lanIps.forEach((ip) => console.log(`📱 Điện thoại (WiFi): http://${ip}:${port}`));
      console.log('===============================================');
      resolve();
    });
    httpServer.once('error', (error) => {
      httpServer = null;
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ THẤT BẠI: Cổng ${port} vẫn đang bị chiếm dụng!`);
      }
      reject(error);
    });
  });

  return httpServer;
}

async function stopServer() {
  if (stopping) return stopping;

  stopping = (async () => {
    const { stopBillingScheduler } = require('./services/billingScheduler');
    const { stopDomainEventWorker } = require('./workers/domainEventWorker');
    const { stopNotificationWorker } = require('./workers/notificationWorker');
    const { stopCmsScheduler } = require('./workers/cmsScheduler');
    const { stopMapLifecycleScheduler } = require('./services/mapLifecycleScheduler');
    stopBillingScheduler();
    stopDomainEventWorker();
    stopNotificationWorker();
    stopCmsScheduler();
    stopMapLifecycleScheduler();
    if (String(process.env.PUBLISH_WORKER_IN_PROCESS || 'false') === 'true') {
      const { stopWorker } = require('./services/publishQueueBull');
      await stopWorker();
    }

    if (httpServer) {
      const server = httpServer;
      httpServer = null;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  })();

  try {
    await stopping;
  } finally {
    stopping = null;
  }
}

function installGracefulShutdown() {
  const shutdown = (signal) => {
    console.log(`Nhận ${signal}, đang dừng dịch vụ...`);
    stopServer()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Không thể dừng dịch vụ an toàn:', error);
        process.exit(1);
      });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { startServer, stopServer, installGracefulShutdown };
