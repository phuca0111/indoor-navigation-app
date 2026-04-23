const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User     = require('../models/User');
const Building = require('../models/Building');
const MapData  = require('../models/MapData');
const QrCode   = require('../models/QrCode');

const DEFAULT_SCALE_RATIO = 0.5;
const DEFAULT_ARRAY_FIELDS = [
  'rooms',
  'doors',
  'pois',
  'nodes',
  'edges',
  'walls',
  'qr_anchors'
];

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function looksLikeBcryptHash(value) {
  return typeof value === 'string' && value.length === 60 && value.startsWith('$2');
}

async function migrateMapData() {
  const docs = await MapData.find().lean();
  let updatedCount = 0;

  for (const doc of docs) {
    const nextMapData = { ...(doc.map_data || {}) };
    let changed = false;

    if (!isPositiveNumber(nextMapData.scale_ratio)) {
      nextMapData.scale_ratio = DEFAULT_SCALE_RATIO;
      changed = true;
    }

    for (const key of DEFAULT_ARRAY_FIELDS) {
      if (!Array.isArray(nextMapData[key])) {
        nextMapData[key] = [];
        changed = true;
      }
    }

    if (!Object.prototype.hasOwnProperty.call(nextMapData, 'background_image')) {
      nextMapData.background_image = '';
      changed = true;
    }

    if (changed) {
      await MapData.updateOne(
        { _id: doc._id },
        { $set: { map_data: nextMapData } }
      );
      updatedCount += 1;
    }
  }

  return { total: docs.length, updated: updatedCount };
}

async function migrateUsers() {
  const docs = await User.find().lean();
  let updatedCount = 0;
  let passwordFixedCount = 0;

  for (const doc of docs) {
    const setPayload = {};
    let changed = false;

    if (!looksLikeBcryptHash(doc.password)) {
      setPayload.password = await bcrypt.hash(String(doc.password || ''), 10);
      passwordFixedCount += 1;
      changed = true;
    }

    if (!Array.isArray(doc.assigned_buildings)) {
      setPayload.assigned_buildings = [];
      changed = true;
    }

    if (changed) {
      await User.updateOne({ _id: doc._id }, { $set: setPayload });
      updatedCount += 1;
    }
  }

  // createdAt từ timestamps có thể bị immutable qua model update, nên backfill trực tiếp ở collection.
  const usersCollection = mongoose.connection.db.collection('users');
  const createdAtBackfill = await usersCollection.updateMany(
    { createdAt: { $exists: false } },
    { $set: { createdAt: new Date() } }
  );

  return {
    total: docs.length,
    updated: updatedCount,
    passwordFixed: passwordFixedCount,
    createdAtFixed: createdAtBackfill.modifiedCount
  };
}

// Backfill field mới cho users (full_name)
async function migrateUsersNewFields() {
  const col = mongoose.connection.db.collection('users');
  const r = await col.updateMany(
    { full_name: { $exists: false } },
    { $set: { full_name: '' } }
  );
  return { fullNameBackfill: r.modifiedCount };
}

// Backfill field mới cho buildings (description, total_floors)
async function migrateBuildings() {
  const docs = await Building.find().lean();
  let updated = 0;
  for (const doc of docs) {
    const set = {};
    if (doc.description === undefined)  { set.description  = ''; }
    if (doc.total_floors === undefined) { set.total_floors = 1;  }
    if (Object.keys(set).length) {
      await Building.updateOne({ _id: doc._id }, { $set: set });
      updated++;
    }
  }
  return { total: docs.length, updated };
}

// Backfill floor_name và chuẩn hóa nodes/edges cũ trong mapdatas
async function migrateFloorFields() {
  const docs = await MapData.find().lean();
  let updated = 0;
  for (const doc of docs) {
    const set = {};
    if (!doc.floor_name) {
      set.floor_name = 'Tầng ' + doc.floor_number;
    }
    // Backfill node_type cho nodes cũ thiếu field
    const nodes = (doc.map_data?.nodes || []).map(n => ({
      ...n,
      node_type: n.node_type || 'NORMAL',
      label:     n.label     || ''
    }));
    // Backfill weight và bidirectional cho edges cũ
    const edges = (doc.map_data?.edges || []).map(e => ({
      ...e,
      bidirectional: e.bidirectional !== undefined ? e.bidirectional : true,
      weight:        e.weight        !== undefined ? e.weight        : 0
    }));

    // Dùng raw collection để tránh Mongoose strict mode bỏ qua field mới
    const col = mongoose.connection.db.collection('mapdatas');
    const rawSet = { 'map_data.nodes': nodes, 'map_data.edges': edges };
    if (set.floor_name) rawSet.floor_name = set.floor_name;
    await col.updateOne({ _id: doc._id }, { $set: rawSet });
    updated++;
  }
  return { total: docs.length, updated };
}

// Tổng hợp qr_anchors từ tất cả floors sang collection qr_codes
async function migrateQrCodes() {
  const docs = await MapData.find().lean();
  let inserted = 0;
  let skipped  = 0;
  for (const doc of docs) {
    const anchors = doc.map_data?.qr_anchors || [];
    for (const anchor of anchors) {
      if (!anchor.qr_code) { skipped++; continue; }
      const exists = await QrCode.findOne({ qr_code: anchor.qr_code });
      if (exists) { skipped++; continue; }
      await QrCode.create({
        qr_code:      anchor.qr_code,
        building_id:  doc.building_id,
        floor_number: doc.floor_number,
        x:            anchor.x     || 0,
        y:            anchor.y     || 0,
        node_id:      anchor.node_id || '',
        label:        anchor.label   || ''
      });
      inserted++;
    }
  }
  return { inserted, skipped };
}

async function run() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('Thiếu MONGO_URI trong file .env');
    }

    await mongoose.connect(mongoUri);

    const mapResult        = await migrateMapData();
    const userResult       = await migrateUsers();
    const userFieldResult  = await migrateUsersNewFields();
    const buildingResult   = await migrateBuildings();
    const floorResult      = await migrateFloorFields();
    const qrResult         = await migrateQrCodes();

    console.log('=== MIGRATION RESULT ===');
    console.log(JSON.stringify({
      mapResult,
      userResult,
      userFieldResult,
      buildingResult,
      floorResult,
      qrResult
    }, null, 2));
  } catch (error) {
    console.error('Migration thất bại:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
