const Notification = require('../models/Notification');
const NotificationDelivery = require('../models/NotificationDelivery');
const NotificationPreference = require('../models/NotificationPreference');
const NotificationTemplate = require('../models/NotificationTemplate');
const User = require('../models/User');
const DomainEvent = require('../models/DomainEvent');

async function upsertNotification(userId, dedupeKey, input, { session } = {}) {
  return Notification.findOneAndUpdate(
    { user_id: userId, dedupe_key: dedupeKey },
    { $setOnInsert: input },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
  ).lean();
}

async function findRecipient(userId) {
  return User.findById(userId).select('email phone device_token fcm_token').lean();
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
  return NotificationDelivery.findOneAndUpdate(
    { notification_id: notificationId, channel },
    { $setOnInsert: input },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
  ).lean();
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
