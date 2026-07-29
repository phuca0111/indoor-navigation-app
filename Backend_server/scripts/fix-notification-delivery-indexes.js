/**
 * Drop index cũ notification_id+channel (gây E11000 khi gửi PUSH nhiều token).
 * Usage: node scripts/fix-notification-delivery-indexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection('notificationdeliveries');
  const indexes = await col.indexes();
  console.log('BEFORE:', indexes.map((i) => i.name));

  for (const idx of indexes) {
    const isOld =
      idx.name === 'notification_id_1_channel_1' ||
      (idx.unique &&
        idx.key &&
        Object.keys(idx.key).length === 2 &&
        idx.key.notification_id === 1 &&
        idx.key.channel === 1 &&
        idx.key.recipient == null);
    if (!isOld) continue;
    await col.dropIndex(idx.name);
    console.log('dropped', idx.name);
  }

  // Đảm bảo unique đúng schema mới
  try {
    await col.createIndex(
      { notification_id: 1, channel: 1, recipient: 1 },
      { unique: true, name: 'notification_id_1_channel_1_recipient_1' }
    );
    console.log('ensured notification_id_1_channel_1_recipient_1');
  } catch (e) {
    console.log('create recipient index:', e.message);
  }

  console.log('AFTER:', (await col.indexes()).map((i) => i.name));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
