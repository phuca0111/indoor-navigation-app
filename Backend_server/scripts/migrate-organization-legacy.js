// ============================================
// FILE: migrate-organization-legacy.js
// MỤC ĐÍCH: Migration data cũ sang multi-tenant với Organization "legacy"
// THỨ TỰ (theo 4.8 SaaS.md):
//   1. Tạo org "legacy" nếu chưa có
//   2. Gán organization_id cho Building thiếu field
//   3. Gán BUILDING_ADMIN organization_id từ assigned_buildings
//   4. SUPER_ADMIN: organization_id = null
//   5. Verify: không còn null
// IDEMPOTENT: chạy nhiều lần vẫn an toàn
// ============================================

require('dotenv').config();
const mongoose = require('mongoose');

// Models
const Organization = require('../models/Organization');
const Building = require('../models/Building');
const User = require('../models/User');

async function migrate() {
    console.log('🚀 Bắt đầu migration Organization...\n');

    try {
        // Kết nối DB — dùng MONGO_URI (giống config/db.js)
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI chưa được khai báo trong .env');
        }
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB (', mongoUri, ')\n');

        // ==========================================
        // BƯỚC 1: Tạo Organization "legacy" nếu chưa có
        // ==========================================
        console.log('📦 Bước 1: Tạo/Cache Organization "legacy"...');
        let legacyOrg = await Organization.findOne({ slug: 'legacy' });
        if (!legacyOrg) {
            legacyOrg = await Organization.create({
                name: 'Legacy / Default',
                slug: 'legacy',
                plan: 'FREE',
                is_active: true
            });
            console.log(`   ✅ Tạo legacy org: ${legacyOrg._id}`);
        } else {
            console.log(`   ✅ Legacy org đã tồn tại: ${legacyOrg._id}`);
        }

        // ==========================================
        // BƯỚC 2: Gán organization_id cho Building thiếu field
        // ==========================================
        console.log('\n🏢 Bước 2: Gán organization_id cho Building...');
        const buildingQuery = {
            $or: [
                { organization_id: { $exists: false } },
                { organization_id: null }
            ]
        };
        const buildingsWithoutOrg = await Building.countDocuments(buildingQuery);
        console.log(`   Buildings thiếu org (null hoặc không có field): ${buildingsWithoutOrg}`);

        if (buildingsWithoutOrg > 0) {
            const updateResult = await Building.updateMany(
                buildingQuery,
                { $set: { organization_id: legacyOrg._id } }
            );
            console.log(`   ✅ Đã cập nhật ${updateResult.modifiedCount} buildings`);
        } else {
            console.log(`   ✅ Không có building nào thiếu org`);
        }

        // ==========================================
        // BƯỚC 3: Gán BUILDING_ADMIN organization_id
        // ==========================================
        console.log('\n👤 Bước 3: Gán BUILDING_ADMIN organization_id...');
        const buildingAdmins = await User.find({ role: 'BUILDING_ADMIN' });
        console.log(`   Tổng BUILDING_ADMIN: ${buildingAdmins.length}`);

        let adminsUpdated = 0;
        let adminsLegacy = 0;
        let adminsAlreadyOk = 0;

        for (const admin of buildingAdmins) {
            // Nếu đã có organization_id (không null) → bỏ qua
            if (admin.organization_id != null) {
                adminsAlreadyOk++;
                continue;
            }

            // Lấy organization từ assigned_buildings
            if (admin.assigned_buildings && admin.assigned_buildings.length > 0) {
                const firstBuilding = await Building.findById(admin.assigned_buildings[0]);
                if (firstBuilding && firstBuilding.organization_id) {
                    admin.organization_id = firstBuilding.organization_id;
                    await admin.save();
                    adminsUpdated++;
                    continue;
                }
            }

            // Nếu không lấy được org từ buildings → gán legacy + log warning
            admin.organization_id = legacyOrg._id;
            await admin.save();
            adminsLegacy++;
            console.warn(`   ⚠️ Admin ${admin.email} -> legacy org (assigned_buildings rỗng hoặc building không có org)`);
        }

        console.log(`   ✅ Updated (from buildings): ${adminsUpdated}`);
        console.log(`   ⚠️  Assigned to legacy: ${adminsLegacy}`);
        console.log(`   ✅ Already had org: ${adminsAlreadyOk}`);

        // ==========================================
        // BƯỚC 4: SUPER_ADMIN giữ null (không đổi)
        // ==========================================
        console.log('\n🛡️  Bước 4: SUPER_ADMIN organization_id = null (giữ nguyên)...');
        const superAdmins = await User.find({ role: 'SUPER_ADMIN' });
        let superAdminsWithNull = 0;
        for (const sa of superAdmins) {
            if (sa.organization_id !== null) {
                sa.organization_id = null;
                await sa.save();
                superAdminsWithNull++;
            }
        }
        console.log(`   ✅ SUPER_ADMIN đã set null: ${superAdminsWithNull}`);

        // ==========================================
        // BƯỚC 5: Verify
        // ==========================================
        console.log('\n🔍 Bước 5: Verify...');
        const buildingsStillNull = await Building.countDocuments({
            $or: [
                { organization_id: { $exists: false } },
                { organization_id: null }
            ]
        });
        const adminsStillNull = await User.countDocuments({
            role: 'BUILDING_ADMIN',
            $or: [
                { organization_id: { $exists: false } },
                { organization_id: null }
            ]
        });

        console.log(`   Buildings còn thiếu org (null hoặc không có field): ${buildingsStillNull}`);
        console.log(`   BUILDING_ADMIN còn thiếu org (null hoặc không có field): ${adminsStillNull}`);

        if (buildingsStillNull === 0 && adminsStillNull === 0) {
            console.log('\n✅ MIGRATION HOÀN TẤT — Tất cả data đều có organization_id!');
        } else {
            console.log('\n⚠️  MIGRATION CÓ VẤN ĐỀ — kiểm tra lại!');
        }

        // Đóng kết nối
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');

    } catch (error) {
        console.error('\n❌ MIGRATION FAILED:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Chạy migration
migrate();
