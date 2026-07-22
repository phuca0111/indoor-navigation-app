require('dotenv').config();
const connectDB = require('../config/db');
const {
  startNotificationWorker,
  stopNotificationWorker
} = require('./notificationWorker');

async function main() {
  await connectDB();
  startNotificationWorker();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopNotificationWorker();
      process.exit(0);
    });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
