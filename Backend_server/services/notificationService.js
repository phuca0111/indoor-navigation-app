const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const DomainEvent = require('../models/DomainEvent');
const { enqueueForNotification } = require('./notificationDispatcher');

function normalizeLimit(value) {
  return Math.min(50, Math.max(1, Number(value) || 20));
}

async function createForUsers(userIds, input) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const notifications = [];
  for (const userId of ids) {
    const dedupeKey = String(
      input.dedupe_key || `${input.type}:${input.event_id || input.aggregate_id || ''}`
    );
    const notification = await Notification.findOneAndUpdate(
      { user_id: userId, dedupe_key: dedupeKey },
      {
        $setOnInsert: {
          organization_id: input.organization_id || null,
          type: input.type,
          title: input.title,
          body: input.body || '',
          severity: input.severity || 'info',
          link: input.link || '',
          data: input.data || {},
          event_id: input.event_id || '',
          expires_at: input.expires_at || null
        }
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    if (!notification) continue;
    const recipient = await User.findById(userId)
      .select('email phone device_token fcm_token')
      .lean();
    await enqueueForNotification(notification, {
      ...input,
      email: input.email || recipient?.email || '',
      phone: input.phone || recipient?.phone || '',
      device_token: input.device_token || recipient?.device_token || recipient?.fcm_token || '',
      channels: input.channels || ['IN_APP']
    });
    notifications.push(notification);
  }
  return notifications;
}

async function createForOrganization(orgId, input, roles = ['ORG_ADMIN']) {
  const users = await User.find({
    organization_id: orgId,
    role: { $in: roles },
    is_active: { $ne: false }
  })
    .select('_id')
    .lean();
  return createForUsers(
    users.map((user) => user._id),
    { ...input, organization_id: orgId }
  );
}

async function createForPlatformAdmins(input) {
  const users = await User.find({
    role: 'SUPER_ADMIN',
    is_active: { $ne: false }
  }).select('_id').lean();
  return createForUsers(users.map((user) => user._id), input);
}

function platformEventNotification(event) {
  const type = String(event.type || 'SYSTEM_EVENT');
  const typeKey = type.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
  const payload = event.payload || {};
  const definitions = {
    PAYMENT_SUCCEEDED: {
      title: 'Thanh toán thành công',
      body: `Hóa đơn ${payload.invoice_id || event.aggregate_id} đã được thanh toán.`,
      severity: 'success',
      link: '#finance'
    },
    SUBSCRIPTION_EXPIRED: {
      title: 'Gói dịch vụ đã hết hạn',
      body: `Subscription ${payload.subscription_id || event.aggregate_id} đã hết hạn.`,
      severity: 'warning',
      link: '#organizations'
    },
    MAP_PUBLISHED: {
      title: 'Bản đồ đã xuất bản',
      body: `Tầng ${payload.floor_number ?? '—'}, phiên bản ${payload.version ?? '—'}.`,
      severity: 'success',
      link: '#buildings'
    },
    REFUND_COMPLETED: {
      title: 'Hoàn tiền thành công',
      body: `Đã hoàn ${Number(payload.amount || 0).toLocaleString('vi-VN')} VND qua ${payload.provider || 'gateway'}.`,
      severity: 'info',
      link: '#finance'
    }
  };
  const definition = definitions[typeKey] || {
    title: 'Sự kiện hệ thống',
    body: type,
    severity: 'info',
    link: '#logs'
  };
  return {
    ...definition,
    type,
    organization_id: event.organization_id || null,
    event_id: event.event_id || '',
    dedupe_key: `platform-event:${event.event_id || event._id}`,
    data: payload
  };
}

async function ensurePlatformHistory(userId) {
  const user = await User.findById(userId).select('role is_active').lean();
  if (!user || user.role !== 'SUPER_ADMIN' || user.is_active === false) return;
  const seeded = await Notification.exists({
    user_id: userId,
    dedupe_key: /^platform-event:/
  });
  if (seeded) return;
  const events = await DomainEvent.find({ status: 'COMPLETED' })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  for (const event of events.reverse()) {
    await createForUsers([userId], platformEventNotification(event));
  }
}

async function listForUser(userId, query = {}) {
  await ensurePlatformHistory(userId);
  const filter = {
    user_id: userId,
    $or: [{ expires_at: null }, { expires_at: { $gt: new Date() } }]
  };
  if (String(query.unread) === 'true') filter.read_at = null;
  if (query.cursor && mongoose.isValidObjectId(query.cursor)) {
    filter._id = { $lt: query.cursor };
  }
  const limit = normalizeLimit(query.limit);
  const rows = await Notification.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    next_cursor: hasMore ? String(items[items.length - 1]._id) : null
  };
}

async function unreadCount(userId) {
  await ensurePlatformHistory(userId);
  return Notification.countDocuments({
    user_id: userId,
    read_at: null,
    $or: [{ expires_at: null }, { expires_at: { $gt: new Date() } }]
  });
}

async function markRead(userId, notificationId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, user_id: userId },
    { $set: { read_at: new Date() } },
    { returnDocument: 'after' }
  );
}

async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { user_id: userId, read_at: null },
    { $set: { read_at: new Date() } }
  );
  return result.modifiedCount || 0;
}

module.exports = {
  createForUsers,
  createForOrganization,
  createForPlatformAdmins,
  platformEventNotification,
  ensurePlatformHistory,
  listForUser,
  unreadCount,
  markRead,
  markAllRead
};
