// 0. Bước Đầu Tiên: Vác Búa đập két .env để lôi các biến Mật khẩu vào RAM bộ nhớ
require('dotenv').config();

// 1. Nhập kho các công cụ xương sống cho Máy Chủ
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db'); // <-- MỚI: Lôi ống nước Database từ Bước 7 sang đây

// 2. Kích hoạt bộ máy Khởi Động Express (Trái Tim Ứng Dụng)
const app = express();

// ==========================================
// 3. THIÊT LẬP CÁC TRẠM KIỂM SOÁT (MIDDLEWARES)
// ==========================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// Cho phép Server phục vụ file HTML/CSS/JS tĩnh (để mở Web Admin trên trình duyệt)
const path = require('path');
app.use('/admin', express.static(path.join(__dirname, 'admin')));  // Phục vụ thư mục admin
app.use('/js', express.static(path.join(__dirname, 'js')));        // Phục vụ thư mục js
app.use('/editor', express.static(path.join(__dirname, '../WebMapEditor'))); // Phục vụ thư mục WebMapEditor

// ==========================================
// 4. GẮN CÁC TẤM BIỂN BÁO ĐƯỜNG DẪN (ROUTES)
// ==========================================
const authRoutes        = require('./routes/authRoutes');
const buildingRoutes    = require('./routes/buildingRoutes');
const mapRoutes         = require('./routes/mapRoutes');
const userRoutes        = require('./routes/userRoutes');
const qrRoutes          = require('./routes/qrRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const mapVersionRoutes  = require('./routes/mapVersionRoutes');

app.use('/api/auth',          authRoutes);
app.use('/api/buildings',     buildingRoutes);
app.use('/api/maps',          mapRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/qr',            qrRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/map-versions',  mapVersionRoutes);

// Đường chào khách khi truy cập trang chủ
app.get('/', (req, res) => {
    res.send('Chào mừng giám khảo đến với Backend Server Hệ thống Bản Đồ Trong Nhà (Thuật toán A*)!');
});

// ==========================================
// 5. CẮM ỐNG NƯỚC DATABASE RỒI MỚI MỞ ĐIỆN KHỞI CHẠY
// ==========================================
const PORT = process.env.PORT || 5000;

// Gọi hàm cắm ống nước Database TRƯỚC, cắm xong mới bật Server
connectDB().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`===============================================`);
        console.log(`🚀 BÁO CÁO: ĐỘNG CƠ MÁY CHỦ ĐÃ KHỞI CHẠY THÀNH CÔNG!`);
        console.log(`🌐 Đang mở cổng lắng nghe tại: http://localhost:${PORT}`);
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
