const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep');
    const MapData = mongoose.model('MapData', new mongoose.Schema({
        building_id: mongoose.Schema.Types.ObjectId,
        floor_number: Number,
        map_data: mongoose.Schema.Types.Mixed
    }));

    const maps = await MapData.find().lean();
    console.log('--- DANH SÁCH BẢN ĐỒ TRONG DB ---');
    maps.forEach(m => {
        console.log(`Building: ${m.building_id}, Floor: ${m.floor_number}, Rooms: ${m.map_data?.rooms?.length || 0}`);
    });
    process.exit();
}

check();
