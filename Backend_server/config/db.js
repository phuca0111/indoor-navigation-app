// Kéo thư viện mongoose vào để làm thợ ống nước
const mongoose = require('mongoose');

// Khai báo một hàm Kết Nối (Bất đồng bộ - async vì gọi lên mạng cần thời gian chờ đợi phản hồi)
const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI chưa được khai báo trong environment variables");
        }
        // Móc đường link MONGO_URI từ trong két sắt bí mật .env ra để cắm ống
        const conn = await mongoose.connect(process.env.MONGO_URI);
        
        // Nếu cắm thành công, báo cáo lên màn hình với cái tên host trả về
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        // Nếu đứt cáp, mất mạng hoặc sai mật khẩu, in ra lỗi màu đỏ
        console.error(`❌ MongoDB Error: ${error.message}`);
        // Chập điện rồi, tắt máy chủ server.js ngay lập tức (lệnh exit code 1)
        process.exit(1);
    }
};

// Đóng gói hàm connectDB này lại, để lát nữa đem sang server.js gắn vào xài
module.exports = connectDB;
