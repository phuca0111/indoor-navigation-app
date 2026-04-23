// ============================================
// FILE: auth.js (Middleware)
// MỤC ĐÍCH: ÔNG BẢO VỆ GÁC CỔNG - Soi thẻ JWT trước khi cho vào
// MỌI API CẦN BẢO MẬT ĐỀU PHẢI ĐI QUA ÔNG NÀY TRƯỚC
// ============================================

const jwt = require('jsonwebtoken');   // Máy soi thẻ

// Hàm bảo vệ: Kiểm tra thẻ JWT có hợp lệ không
const auth = (req, res, next) => {
    try {
        // Bước 1: Lục túi áo của khách (Header) xem có mang thẻ không
        // Thẻ nằm trong Header có dạng: "Bearer eyJhbGciOi..."
        const authHeader = req.headers.authorization;

        // Nếu khách không mang thẻ -> Đuổi cổ ngay
        if (!authHeader) {
            return res.status(401).json({ message: 'Truy cập bị từ chối! Bạn chưa đăng nhập (không có token).' });
        }

        // Bước 2: Tách lấy phần mã thẻ (bỏ chữ "Bearer " phía trước)
        const token = authHeader.split(' ')[1];

        // Bước 3: Đưa thẻ vào máy soi để kiểm tra
        // jwt.verify sẽ dùng con dấu bí mật trong .env để xác minh thẻ có phải do mình in ra không
        const thongTinTrongThe = jwt.verify(token, process.env.JWT_SECRET);

        // Bước 4: Thẻ hợp lệ! Gắn thông tin người dùng vào yêu cầu để các hàm phía sau dùng
        req.user = thongTinTrongThe;

        // Bước 5: Mở barie cho đi qua -> Chạy tiếp vào hàm xử lý phía sau
        next();

    } catch (error) {
        // Thẻ giả hoặc hết hạn -> Đuổi cổ
        res.status(401).json({ message: 'Thẻ không hợp lệ hoặc đã hết hạn! Vui lòng đăng nhập lại.' });
    }
};

// Hàm kiểm tra vai trò: Chỉ cho Super Admin đi qua
// Dùng cho các API nhạy cảm như: Tạo tài khoản mới, Xóa tài khoản
const requireSuperAdmin = (req, res, next) => {
    // Kiểm tra vai trò đã được gắn ở bước trên
    if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ message: 'Bạn không có quyền Super Admin để thực hiện thao tác này!' });
    }
    // Đúng là Super Admin -> Cho qua
    next();
};

module.exports = { auth, requireSuperAdmin };
