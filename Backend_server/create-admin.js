// Tạo Super Admin đầu tiên trong hệ thống
// Chạy: node create-admin.js

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createSuperAdmin() {
    try {
        // Kết nối DB (dùng MONGO_URI từ .env)
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('MONGO_URI không được set trong .env');
            process.exit(1);
        }

        await mongoose.connect(mongoUri);
        console.log('✅ Đã kết nối MongoDB');

        const email = 'admin@example.com';
        const password = 'Admin@123';

        // Kiểm tra đã tồn tại chưa
        const existing = await User.findOne({ email });
        if (existing) {
            console.log('⚠️ Admin với email này đã tồn tại.');
            process.exit(0);
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Tạo admin
        const admin = await User.create({
            email: email,
            password: hashedPassword,
            role: 'SUPER_ADMIN',
            full_name: 'Super Admin',
            is_active: true,
            assigned_buildings: []
        });

        console.log('✅ Tạo Super Admin thành công:');
        console.log('   Email:', admin.email);
        console.log('   Role:', admin.role);
        console.log('   ID:', admin._id);
        console.log('\n🔐 Đăng nhập tại /admin với credentials:');
        console.log('   Email:', email);
        console.log('   Password:', password);

        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        process.exit(1);
    }
}

createSuperAdmin();
