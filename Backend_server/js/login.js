// ============================================
// FILE: login.js
// MỤC ĐÍCH: Xử lý logic khi Admin bấm nút Đăng Nhập
// LUỒNG: Gom Email + Pass → Bắn API → Nhận JWT → Cất vào localStorage → Nhảy sang Dashboard
// ============================================

// Địa chỉ máy chủ Backend (cùng máy tính, cổng 5000)
const API_URL = 'http://localhost:5000/api';

// Bắt sự kiện khi Admin bấm nút "Đăng Nhập"
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    // Chặn form tự động reload trang (hành vi mặc định của HTML)
    e.preventDefault();

    // Bước 1: Lấy giá trị Email và Mật khẩu mà Admin vừa gõ
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('errorMessage');

    // Ẩn thông báo lỗi cũ (nếu có)
    errorMsg.style.display = 'none';

    try {
        // Bước 2: Đóng gói Email + Pass thành JSON, bắn tới API đăng nhập
        const response = await fetch(API_URL + '/auth/login', {
            method: 'POST',                            // Phương thức POST (gửi dữ liệu lên)
            headers: { 'Content-Type': 'application/json' },  // Nói cho Server biết mình gửi JSON
            body: JSON.stringify({ email, password })   // Biến object thành chuỗi JSON gửi đi
        });

        // Bước 3: Nhận phản hồi từ Server
        const data = await response.json();

        // Bước 4: Kiểm tra kết quả
        if (response.ok) {
            // THÀNH CÔNG! Server trả về Thẻ JWT
            // Cất Thẻ JWT vào tủ đồ của trình duyệt (localStorage)
            localStorage.setItem('token', data.token);
            if (data.refreshToken) {
                localStorage.setItem('refreshToken', data.refreshToken);
            }
            localStorage.setItem('userEmail', data.user.email);
            localStorage.setItem('userRole', data.user.role);
            localStorage.setItem('userId', data.user.id);

            // Nhảy sang trang Dashboard
            window.location.href = 'dashboard.html';

        } else {
            // THẤT BẠI! Hiển thị lỗi (sai mật khẩu, email không tồn tại...)
            errorMsg.textContent = data.message;
            errorMsg.style.display = 'block';
        }

    } catch (error) {
        // Lỗi mạng (Server chưa bật, mất internet...)
        errorMsg.textContent = 'Không thể kết nối tới máy chủ! Hãy kiểm tra Server đã bật chưa.';
        errorMsg.style.display = 'block';
    }
});
