// Script khởi tạo các collection chưa có document nào
// Chạy 1 lần: node scripts/init_collections.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const RefreshToken = require('../models/RefreshToken');
const MapVersion   = require('../models/MapVersion');
const QrCode       = require('../models/QrCode');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);

    // Tạo rồi xóa ngay để MongoDB khởi tạo collection
    const collections = [
        { model: RefreshToken, name: 'refreshtokens',
          seed: { user_id: new mongoose.Types.ObjectId(), token_hash: '_init_', expires_at: new Date(Date.now() + 1000) } },
        { model: MapVersion,   name: 'mapversions',
          seed: { building_id: new mongoose.Types.ObjectId(), floor_number: 0, version: 0 } },
        { model: QrCode,       name: 'qrcodes',
          seed: { qr_code: '_init_', building_id: new mongoose.Types.ObjectId(), floor_number: 0, x: 0, y: 0 } }
    ];

    for (const { model, name, seed } of collections) {
        const existing = await model.countDocuments();
        if (existing === 0) {
            const doc = await model.create(seed);
            await model.deleteOne({ _id: doc._id });
            console.log(`Collection "${name}" đã được khởi tạo.`);
        } else {
            console.log(`Collection "${name}" đã có ${existing} document(s) — bỏ qua.`);
        }
    }

    await mongoose.disconnect();
    console.log('Hoàn tất.');
}

run().catch(e => { console.error(e); process.exit(1); });
