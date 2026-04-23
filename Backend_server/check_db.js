const mongoose = require('mongoose');
require('dotenv').config({ path: './Backend_server/.env' });

async function checkMaps() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const maps = await mongoose.connection.db.collection('maps').find({}).toArray();
        console.log('--- DANH SÁCH BẢN ĐỒ TRONG DATABASE ---');
        maps.forEach(m => {
            console.log(`Building ID: ${m.building_id}, Floor: ${m.floor_number}, Version: ${m.version}`);
        });

        const buildings = await mongoose.connection.db.collection('buildings').find({}).toArray();
        console.log('\n--- DANH SÁCH TÒA NHÀ ---');
        buildings.forEach(b => {
            console.log(`ID: ${b._id}, Name: ${b.name}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkMaps();
