const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { looksLikeBcryptHash } = require('../services/passwordAuth');
const { requireSafeMigrationUri } = require('./migration-safety');

async function run() {
  const apply = process.argv.includes('--apply');
  const verifyOnly = process.argv.includes('--verify');
  await mongoose.connect(requireSafeMigrationUri());
  const cursor = User.find({ password: { $exists: true, $ne: null } }).select('+password').cursor();
  let scanned = 0;
  let legacy = 0;
  let migrated = 0;
  for await (const user of cursor) {
    scanned += 1;
    if (looksLikeBcryptHash(user.password)) continue;
    legacy += 1;
    if (apply && !verifyOnly) {
      user.password = await bcrypt.hash(user.password, 10);
      await user.save({ validateBeforeSave: false });
      migrated += 1;
    }
  }
  console.log(JSON.stringify({
    mode: verifyOnly ? 'verify' : apply ? 'apply' : 'dry-run',
    scanned,
    legacy_plaintext_remaining: verifyOnly ? legacy : Math.max(0, legacy - migrated),
    migrated
  }));
  if (verifyOnly && legacy > 0) process.exitCode = 2;
}

run()
  .catch((error) => {
    console.error('[password-migration] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
