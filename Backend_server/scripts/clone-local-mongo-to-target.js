/**
 * Clone toàn bộ DB Mongo local → Atlas (production Render).
 *
 * Cách dùng (PowerShell):
 *   $env:SOURCE_MONGO_URI = "mongodb://localhost:27017/HeThongBanDoTotNghiep"
 *   $env:TARGET_MONGO_URI = "<dán MONGO_URI từ Render — che khi chat>"
 *   node scripts/clone-local-mongo-to-target.js
 *
 * Mặc định SOURCE = mongodb://localhost:27017/HeThongBanDoTotNghiep
 * Cờ: --dry-run chỉ liệt kê; --drop xóa collection đích trước khi copy.
 */
const { MongoClient } = require('mongodb');

const SOURCE =
  (process.env.SOURCE_MONGO_URI || '').trim() ||
  'mongodb://localhost:27017/HeThongBanDoTotNghiep';
const TARGET = (process.env.TARGET_MONGO_URI || '').trim();
const DRY = process.argv.includes('--dry-run');
const DROP = process.argv.includes('--drop');
const BATCH = 500;

function dbNameFromUri(uri) {
  try {
    const path = new URL(uri).pathname.replace(/^\//, '');
    return path.split('?')[0] || null;
  } catch {
    const m = String(uri).match(/\/([^/?]+)(\?|$)/);
    return m ? m[1] : null;
  }
}

async function copyCollection(srcDb, dstDb, name) {
  const src = srcDb.collection(name);
  const dst = dstDb.collection(name);
  const total = await src.countDocuments();
  if (DRY) {
    console.log(`[dry] ${name}: ${total}`);
    return { name, total, copied: 0 };
  }
  if (DROP) {
    await dst.drop().catch(() => {});
  }
  if (total === 0) {
    console.log(`skip  ${name}: 0`);
    return { name, total, copied: 0 };
  }
  let copied = 0;
  const cursor = src.find({}).batchSize(BATCH);
  let batch = [];
  while (await cursor.hasNext()) {
    batch.push(await cursor.next());
    if (batch.length >= BATCH) {
      await dst.insertMany(batch, { ordered: false }).catch(async (e) => {
        if (e.code !== 11000 && e.writeErrors) {
          // duplicate khi chạy lại không --drop: bỏ qua conflict
          const nonDup = (e.writeErrors || []).filter((w) => w.code !== 11000);
          if (nonDup.length) throw e;
        } else if (e.code !== 11000 && !e.writeErrors) {
          throw e;
        }
      });
      copied += batch.length;
      batch = [];
      process.stdout.write(`\r  ${name}: ${copied}/${total}`);
    }
  }
  if (batch.length) {
    await dst.insertMany(batch, { ordered: false }).catch((e) => {
      if (e.code !== 11000 && !(e.writeErrors || []).every((w) => w.code === 11000)) throw e;
    });
    copied += batch.length;
  }
  console.log(`\r ok   ${name}: ${copied}/${total}          `);
  return { name, total, copied };
}

async function main() {
  if (!TARGET) {
    console.error('Thiếu TARGET_MONGO_URI. Copy MONGO_URI từ Render Environment rồi:');
    console.error('  $env:TARGET_MONGO_URI = "mongodb+srv://..."');
    console.error('  node scripts/clone-local-mongo-to-target.js');
    process.exit(1);
  }
  if (SOURCE === TARGET) {
    console.error('SOURCE và TARGET trùng nhau — dừng.');
    process.exit(1);
  }

  console.log('SOURCE:', SOURCE.replace(/\/\/([^@/]+)@/, '//***@'));
  console.log('TARGET:', TARGET.replace(/\/\/([^@/]+)@/, '//***@'));
  console.log('MODE:', DRY ? 'dry-run' : DROP ? 'drop+copy' : 'copy (giữ doc đích nếu trùng _id)');

  const srcClient = new MongoClient(SOURCE);
  const dstClient = new MongoClient(TARGET);
  await srcClient.connect();
  await dstClient.connect();

  const srcDbName = dbNameFromUri(SOURCE) || 'HeThongBanDoTotNghiep';
  const dstDbName = dbNameFromUri(TARGET) || srcDbName;
  const srcDb = srcClient.db(srcDbName);
  const dstDb = dstClient.db(dstDbName);
  console.log(`DB ${srcDbName} → ${dstDbName}`);

  const cols = (await srcDb.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'))
    .sort();
  console.log(`Collections: ${cols.length}`);

  for (const name of cols) {
    await copyCollection(srcDb, dstDb, name);
  }

  await srcClient.close();
  await dstClient.close();
  console.log(DRY ? 'Dry-run xong.' : 'Clone xong. Redeploy không bắt buộc — refresh web production.');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
