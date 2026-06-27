// ============================================
// FILE: verify-org-migration.js
// MỤC ĐÍCH: Kiểm tra migration organization đã chạy đầy đủ
// Output: số lượng building/user thiếu organization_id
// ============================================

require('dotenv').config();
const mongoose = require('mongoose');

const Organization = require('../models/Organization');
const Building = require('../models/Building');
const User = require('../models/User');

async function verify() {
    console.log('🔍 Bắt đầu verify Organization migration...\n');

    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI chưa được khai báo trong .env');
        }
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // 1. Kiểm tra Organization "legacy" tồn tại
        const legacyOrg = await Organization.findOne({ slug: 'legacy' });
        if (!legacyOrg) {
            console.log('❌ Không tìm thấy Organization "legacy"');
        } else {
            console.log(`✅ Legacy Organization tồn tại: ${legacyOrg._id} (${legacyOrg.name})`);
        }

        // 2. Building query (missing org)
        const buildingQuery = {
            $or: [
                { organization_id: { $exists: false } },
                { organization_id: null }
            ]
        };

        const totalBuildings = await Building.countDocuments();
        const buildingsWithoutOrg = await Building.countDocuments(buildingQuery);
        const buildingsWithOrg = totalBuildings - buildingsWithoutOrg;

        console.log(`\n📊 Buildings:`);
        console.log(`   Tổng: ${totalBuildings}`);
        console.log(`   Có organization_id: ${buildingsWithOrg}`);
        console.log(`   Thiếu organization_id: ${buildingsWithoutOrg}`);

        if (buildingsWithoutOrg > 0) {
            const samples = await Building.find(buildingQuery).limit(5).lean();
            console.log(`   Mẫu building thiếu org:`, samples.map(b => b._id));
        }

        // 3. User query (BUILDING_ADMIN thiếu org)
        const userQuery = {
            role: 'BUILDING_ADMIN',
            $or: [
                { organization_id: { $exists: false } },
                { organization_id: null }
            ]
        };

        const totalBuildingAdmins = await User.countDocuments({ role: 'BUILDING_ADMIN' });
        const adminsWithoutOrg = await User.countDocuments(userQuery);
        const adminsWithOrg = totalBuildingAdmins - adminsWithoutOrg;

        console.log(`\n📊 BUILDING_ADMIN:`);
        console.log(`   Tổng: ${totalBuildingAdmins}`);
        console.log(`   Có organization_id: ${adminsWithOrg}`);
        console.log(`   Thiếu organization_id: ${adminsWithoutOrg}`);

        if (adminsWithoutOrg > 0) {
            const samples = await User.find(userQuery).limit(5).lean();
            console.log(`   Mẫu admin thiếu org:`, samples.map(u => `${u.email} (${u._id})`));
        }

        // 4. SUPER_ADMIN check
        const superAdmins = await User.find({ role: 'SUPER_ADMIN' });
        let superAdminsWithOrg = 0;
        for (const sa of superAdmins) {
            if (sa.organization_id !== null && sa.organization_id !== undefined) {
                superAdminsWithOrg++;
            }
        }
        console.log(`\n📊 SUPER_ADMIN:`);
        console.log(`   Tổng: ${superAdmins.length}`);
        console.log(`   Có organization_id (không phải null): ${superAdminsWithOrg}`);
        console.log(`   organization_id = null: ${superAdmins.length - superAdminsWithOrg}`);

        // Summary
        console.log('\n' + '='.repeat(50));
        if (buildingsWithoutOrg === 0 && adminsWithoutOrg === 0) {
            console.log('✅ VERIFY PASSED — Tất cả data đều có organization_id!');
        } else {
            console.log('⚠️  VERIFY FAILED — Còn entity thiếu organization_id:');
            console.log(`    Buildings: ${buildingsWithoutOrg}`);
            console.log(`    BUILDING_ADMIN: ${adminsWithoutOrg}`);
            console.log('\n   Hãy chạy: npm run migrate:org');
        }
        console.log('='.repeat(50));

        await mongoose.disconnect();
        process.exit(buildingsWithoutOrg === 0 && adminsWithoutOrg === 0 ? 0 : 1);

    } catch (error) {
        console.error('\n❌ VERIFY FAILED:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

verify();
