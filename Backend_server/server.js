// 0. Bước Đầu Tiên: Vác Búa đập két .env để lôi các biến Mật khẩu vào RAM bộ nhớ
require('dotenv').config();

// 1. Nhập kho các công cụ xương sống cho Máy Chủ
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db'); // <-- MỚI: Lôi ống nước Database từ Bước 7 sang đây

// 2. Kích hoạt bộ máy Khởi Động Express (Trái Tim Ứng Dụng)
const app = express();

// ==========================================
// 3. THIÊT LẬP CÁC TRẠM KIỂM SOÁT (MIDDLEWARES)
// ==========================================

// CORS: Chỉ cho phép origins được cấu hình
// TODO: Cấu hình CORS_ORIGIN trong .env khi deploy production
// Ví dụ: CORS_ORIGIN=http://localhost:5000,https://your-render-url.onrender.com
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:5000', 'http://localhost:3000', 'http://127.0.0.1:5000'],
  credentials: true
};
app.use(cors(corsOptions));

// Security headers (tắt CSP vì admin dashboard/editor cần inline scripts)
app.use(helmet({
  contentSecurityPolicy: false
}));

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Cho phép Server phục vụ file HTML/CSS/JS tĩnh (để mở Web Admin trên trình duyệt)
const path = require('path');

// ============================================================
// NO-CACHE MIDDLEWARE CHO HTML FILES
// WHY: Ngăn browser cache login/dashboard pages.
// Nếu cache, user có thể:
// - Nhấn Back và thấy dashboard cũ (dù đã logout)
// - Mở dashboard trực tiếp từ cache (không gọi server verify)
// - Xem được nội dung nhạy cảm từ cache.
// HOW: Thêm headers: Cache-Control, Pragma, Expires.
// SCOPE: Chỉ áp dụng cho file .html, không cho CSS/JS (có thể cache).
// ============================================================
const noCacheHTML = (req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
};

// Phục vụ thư mục admin với no-cache cho HTML
app.use('/admin', noCacheHTML, express.static(path.join(__dirname, 'admin'), {
  setHeaders: (res, filepath) => {
    // Double ensure: setHeaders cũng được gọi bởi express.static
    if (filepath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));
app.use('/js', express.static(path.join(__dirname, 'js'))); // CSS/JS có thể cache
app.use('/utils', express.static(path.join(__dirname, 'utils'))); // shared helpers (dashboard)
app.use('/editor', express.static(path.join(__dirname, '../WebMapEditor')));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 4. GẮN CÁC TẤM BIỂN BÁO ĐƯỜNG DẪN (ROUTES)
// ==========================================
const authRoutes = require('./routes/authRoutes');
const buildingRoutes = require('./routes/buildingRoutes');
const mapRoutes = require('./routes/mapRoutes');
const userRoutes = require('./routes/userRoutes');
const qrRoutes = require('./routes/qrRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const mapVersionRoutes = require('./routes/mapVersionRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const orgRegistrationRoutes = require('./routes/orgRegistrationRoutes');
const orgJoinRoutes = require('./routes/orgJoinRoutes');
const platformStatsRoutes = require('./routes/platformStatsRoutes');
const billingRoutes = require('./routes/billingRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const tptpPayRoutes = require('./routes/tptpPayRoutes');
const tptpBankRoutes = require('./routes/tptpBankRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const financeRoutes = require('./routes/financeRoutes');
const overviewRoutes = require('./routes/overviewRoutes');
const draftRoutes = require('./routes/draftRoutes');
const floorLockRoutes = require('./routes/floorLockRoutes');
const publishRoutes = require('./routes/publishRoutes');
const storageRoutes = require('./routes/storageRoutes');
const contactRoutes = require('./routes/contactRoutes');
const { getLocalRoot } = require('./services/objectStorage');

app.use('/api/auth', authRoutes);
app.use('/api/buildings', buildingRoutes);
app.use('/api/v1', draftRoutes);
app.use('/api/v1', floorLockRoutes);
app.use('/api/v1', publishRoutes);
app.use('/api/v1', storageRoutes);
// Phase 2d — serve local object storage
app.use('/uploads', express.static(getLocalRoot()));
app.use('/api/maps', mapRoutes);
app.use('/api/users', userRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/map-versions', mapVersionRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/org-registrations', orgRegistrationRoutes);
app.use('/api/org-join-requests', orgJoinRoutes);
app.use('/api/platform', platformStatsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/tptp-pay', tptpPayRoutes);
app.use('/api/tptp-bank', tptpBankRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/website', require('./routes/websiteRoutes'));
app.use('/tptp-pay', tptpPayRoutes);

// Export app cho testing
module.exports = app;

// Chỉ start server nếu đây là file main (không phải được require bởi test)
if (require.main === module) {
// ==========================================
// 5. CẮM ỐNG NƯỚC DATABASE RỒI MỚI MỞ ĐIỆN KHỞI CHẠY
// ==========================================
const PORT = process.env.PORT || 5000;

// Gọi hàm cắm ống nước Database TRƯỚC, cắm xong mới bật Server
connectDB().then(() => {
  const { startBillingScheduler } = require('./services/billingScheduler');
  startBillingScheduler();
  const { ensureDefaultPlans } = require('./services/planCatalog');
  ensureDefaultPlans().catch((e) => console.warn('planCatalog seed:', e.message));
  const BankUser = require('./models/BankUser');
  BankUser.ensureBankUserIndexes().catch((e) => console.warn('BankUser indexes:', e.message));

  const HOST = process.env.HOST || '0.0.0.0';
  const server = app.listen(PORT, HOST, () => {
    const os = require('os');
    const lanIps = Object.values(os.networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => n.address);
    console.log(`===============================================`);
    console.log(`🚀 BÁO CÁO: ĐỘNG CƠ MÁY CHỦ ĐÃ KHỞI CHẠY THÀNH CÔNG!`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    lanIps.forEach((ip) => console.log(`📱 Điện thoại (WiFi): http://${ip}:${PORT}`));
    console.log(`===============================================`);
  });

  // Bắt lỗi nếu sập nguồn đột ngột
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ THẤT BẠI: Cổng ${PORT} vẫn đang bị chiếm dụng!`);
    } else {
      console.error(`❌ THẤT BẠI: Lỗi khởi động Server:`, err);
    }
    process.exit(1);
  });
}).catch(err => {
  console.error('❌ KHÔNG THỂ KẾT NỐI DATABASE:', err);
  process.exit(1);
});
}
