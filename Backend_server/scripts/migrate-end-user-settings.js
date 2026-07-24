/**
 * Idempotent — End User settings defaults on User.preferences
 * Usage: node scripts/migrate-end-user-settings.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
  await mongoose.connect(uri);
  const res = await User.updateMany(
    {
      $or: [
        { 'preferences.privacy': { $exists: false } },
        { 'preferences.location': { $exists: false } }
      ]
    },
    {
      $set: {
        'preferences.privacy.show_email': false,
        'preferences.privacy.show_activity': true,
        'preferences.location.share_precise': true,
        'preferences.location.default_radius_m': 1500
      }
    }
  );
  console.log('migrate-end-user-settings:', {
    matched: res.matchedCount ?? res.n,
    modified: res.modifiedCount ?? res.nModified
  });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
