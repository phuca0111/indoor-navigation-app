require('dotenv').config();

const { createApp } = require('./app');

// Giữ contract cũ: require('./server') luôn trả về Express app.
const app = createApp();
module.exports = app;

if (require.main === module) {
  const { startServer, installGracefulShutdown } = require('./bootstrap');
  installGracefulShutdown();
  startServer(app).catch((error) => {
    console.error('❌ KHÔNG THỂ KHỞI ĐỘNG SERVER:', error);
    process.exit(1);
  });
}
