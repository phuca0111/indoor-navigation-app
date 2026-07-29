const Notification = require('../models/Notification');
const NotificationDelivery = require('../models/NotificationDelivery');
const NotificationPreference = require('../models/NotificationPreference');
const NotificationTemplate = require('../models/NotificationTemplate');
const User = require('../models/User');
const UserDevice = require('../models/UserDevice');
const DomainEvent = require('../models/DomainEvent');

async function upsertNotification(userId, dedupeKey, input, { session } = {}) {
  return Notification.findOneAndUpdate(
    { user_id: userId, dedupe_key: dedupeKey },
    { $setOnInsert: input },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
  ).lean();
}

async function findRecipient(userId) {
  return User.findById(userId)
    .select('email phone device_token fcm_token notification_preferences.emergency_push')
    .lean();
}

async function findActiveFcmTokens(userId) {
  const rows = await UserDevice.find({
    user_id: userId,
    is_active: true,
    fcm_token: { $exists: true, $ne: '' }
  })
    .select('fcm_token')
    .sort({ last_seen_at: -1 })
    .limit(20)
    .lean();
  return [...new Set(rows.map((row) => String(row.fcm_token || '').trim()).filter(Boolean))];
}

async function isEmergencyPushEnabled(userId) {
  const user = await User.findById(userId).select('notification_preferences.emergency_push').lean();
  return user?.notification_preferences?.emergency_push !== false;
}

async function listRecipientIds(filter) {
  const rows = await User.find(filter).select('_id').lean();
  return rows.map((row) => row._id);
}

async function findPreference(userId, category) {
  return NotificationPreference.findOne({ user_id: userId, category }).lean();
}

async function findTemplate(filter) {
  return NotificationTemplate.findOne(filter).lean();
}

async function upsertDelivery(notificationId, channel, input, { session } = {}) {
  const recipient = String(input.recipient || '');
  const filter = {
    notification_id: notificationId,
    channel,
    recipient
  };
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    ...(session ? { session } : {})
  };
  try {
    return await NotificationDelivery.findOneAndUpdate(
      filter,
      { $setOnInsert: { ...input, recipient } },
      options
    ).lean();
  } catch (err) {
    // Race upsert / index cũ notification_id+channel → đọc lại bản ghi hiện có
    if (err?.code !== 11000) throw err;
    const existing =
      (await NotificationDelivery.findOne(filter).lean()) ||
      (await NotificationDelivery.findOne({ notification_id: notificationId, channel }).lean());
    if (existing) return existing;
    throw err;
  }
}

async function claimDelivery(owner, now, leaseExpiresAt) {
  return NotificationDelivery.findOneAndUpdate(
    {
      status: { $in: ['PENDING', 'RETRY', 'DEFERRED', 'PROCESSING'] },
      available_at: { $lte: now },
      $or: [{ lease_expires_at: null }, { lease_expires_at: { $lte: now } }]
    },
    {
      $set: { status: 'PROCESSING', lease_owner: owner, lease_expires_at: leaseExpiresAt },
      $inc: { attempts: 1 }
    },
    { sort: { available_at: 1, createdAt: 1 }, new: true }
  ).lean();
}

async function completeDelivery(id, owner, update) {
  return NotificationDelivery.findOneAndUpdate(
    { _id: id, status: 'PROCESSING', lease_owner: owner },
    update,
    { new: true }
  ).lean();
}

async function getDelivery(id) {
  return NotificationDelivery.findById(id).lean();
}

async function listForUser(userId, filter, limit) {
  return Notification.find({ user_id: userId, ...filter })
    .sort({ _id: -1 }).limit(limit).lean();
}

async function countUnread(userId, now) {
  return Notification.countDocuments({
    user_id: userId,
    read_at: null,
    $or: [{ expires_at: null }, { expires_at: { $gt: now } }]
  });
}

async function markRead(userId, id) {
  return Notification.findOneAndUpdate(
    { _id: id, user_id: userId },
    { $set: { read_at: new Date() } },
    { new: true }
  ).lean();
}

async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { user_id: userId, read_at: null },
    { $set: { read_at: new Date() } }
  );
  return Number(result.modifiedCount) || 0;
}

async function hasPlatformHistory(userId) {
  return Boolean(await Notification.exists({ user_id: userId, dedupe_key: /^platform-event:/ }));
}

async function userRole(userId) {
  return User.findById(userId).select('role is_active').lean();
}

async function recentCompletedEvents(limit) {
  return DomainEvent.find({ status: 'COMPLETED' }).sort({ createdAt: -1 }).limit(limit).lean();
}

module.exports = {
  upsertNotification,
  findRecipient,
  findActiveFcmTokens,
  isEmergencyPushEnabled,
  listRecipientIds,
  findPreference,
  findTemplate,
  upsertDelivery,
  claimDelivery,
  completeDelivery,
  getDelivery,
  listForUser,
  countUnread,
  markRead,
  markAllRead,
  hasPlatformHistory,
  userRole,
  recentCompletedEvents
};
