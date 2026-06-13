const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Building = require('../models/Building');
const Floor = require('../models/Floor');

async function auditData() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep');
        console.log("✅ Đã kết nối Database: " + (process.env.MONGO_URI || 'default'));

        const usersCount = await User.countDocuments();
        const buildingsCount = await Building.countDocuments();
        const floorsCount = await Floor.countDocuments();

        console.log("\n📊 THỐNG KÊ DỮ LIỆU HIỆN TẠI:");
        console.log(`- Số lượng Tài khoản: ${usersCount}`);
        console.log(`- Số lượng Tòa nhà:   ${buildingsCount}`);
        console.log(`- Số lượng Bản đồ tầng: ${floorsCount}`);

        if (buildingsCount > 0) {
            const buildings = await Building.find().limit(5);
            console.log("\n🏢 DANH SÁCH 5 TÒA NHÀ GẦN NHẤT:");
            buildings.forEach(b => console.log(`  + [${b._id}] ${b.name} (${b.address})`));
        }

        if (floorsCount > 0) {
            const floors = await Floor.find().limit(10);
            console.log("\n🗺️ CHI TIẾT CÁC BẢN ĐỒ TẦNG:");
            floors.forEach(f => {
                const data = f.map_data || {};
                const roomCount = data.rooms ? data.rooms.length : 0;
                const nodeCount = data.nodes ? data.nodes.length : 0;
                const wallCount = data.walls ? data.walls.length : 0;
                console.log(`  + Tòa nhà ID: ${f.building_id}, Tầng: ${f.floor_number} [${f.floor_name || 'Không tên'}]`);
                console.log(`    -> ${roomCount} phòng, ${nodeCount} node, ${wallCount} đoạn tường`);
            });
        }

        const adminBuildings = await Building.find({ name: /admin/i });
        if (adminBuildings.length > 0) {
            console.log(`\n🔍 TÌM THẤY ${adminBuildings.length} TÒA NHÀ CÓ TÊN 'ADMIN':`);
            for (const b of adminBuildings) {
                const fCount = await Floor.countDocuments({ building_id: b._id });
                const floors = await Floor.find({ building_id: b._id });
                console.log(`  + [${b._id}] ${b.name} - Số tầng: ${fCount}`);
                floors.forEach(f => {
                    console.log(`    - Tầng ${f.floor_number}: ${f.map_data.rooms.length} phòng, ${f.map_data.nodes.length} nodes`);
                });
            }
        } else {
            console.log(`\n❌ Không tìm thấy tòa nhà nào có tên 'ADMIN'`);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error("❌ Lỗi kiểm tra:", err);
    }
}

auditData();
