const notificationRepository = require('../../repositories/notificationRepository');
const deliveryApplication = require('./notificationDeliveryApplicationService');

function platformEventNotification(event) {
  const type = String(event.type || 'SYSTEM_EVENT');
  const key = type.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
  const payload = event.payload || {};
  const definitions = {
    PAYMENT_SUCCEEDED: ['Thanh toán thành công', `Hóa đơn ${payload.invoice_id || event.aggregate_id} đã được thanh toán.`, 'success', '#finance'],
    SUBSCRIPTION_EXPIRED: ['Gói dịch vụ đã hết hạn', `Subscription ${payload.subscription_id || event.aggregate_id} đã hết hạn.`, 'warning', '#organizations'],
    MAP_PUBLISHED: ['Bản đồ đã xuất bản', `Tầng ${payload.floor_number ?? '—'}, phiên bản ${payload.version ?? '—'}.`, 'success', '#buildings'],
    REFUND_COMPLETED: ['Hoàn tiền thành công', `Đã hoàn ${Number(payload.amount || 0).toLocaleString('vi-VN')} VND qua ${payload.provider || 'gateway'}.`, 'info', '#finance']
  };
  const [title, body, severity, link] = definitions[key] || ['Sự kiện hệ thống', type, 'info', '#logs'];
  return {
    title,
    body,
    severity,
    link,
    type,
    organization_id: event.organization_id || null,
    event_id: event.event_id || '',
    dedupe_key: `platform-event:${event.event_id || event._id}`,
    data: payload
  };
}

async function createForUsers(userIds, input) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const notifications = [];
  for (const userId of ids) {
    const dedupeKey = String(
      input.dedupe_key || `${input.type}:${input.event_id || input.aggregate_id || ''}`
    );
    const notification = await notificationRepository.upsertNotification(
      userId,
      dedupeKey,
      {
        organization_id: input.organization_id || null,
        type: input.type,
        title: input.title,
        body: input.body || '',
        severity: input.severity || 'info',
        link: input.link || '',
        data: input.data || {},
        event_id: input.event_id || '',
        expires_at: input.expires_at || null,
        dedupe_key: dedupeKey
      }
    );
    const recipient = await notificationRepository.findRecipient(userId);
    await deliveryApplication.enqueueForNotification(notification, {
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
  const ids = await notificationRepository.listRecipientIds({
    organization_id: orgId,
    role: { $in: roles },
    is_active: { $ne: false }
  });
  return createForUsers(ids, { ...input, organization_id: orgId });
}

async function createForPlatformAdmins(input) {
  const ids = await notificationRepository.listRecipientIds({
    role: 'SUPER_ADMIN',
    is_active: { $ne: false }
  });
  return createForUsers(ids, input);
}

async function ensurePlatformHistory(userId) {
  const user = await notificationRepository.userRole(userId);
  if (!user || user.role !== 'SUPER_ADMIN' || user.is_active === false) return;
  if (await notificationRepository.hasPlatformHistory(userId)) return;
  const events = await notificationRepository.recentCompletedEvents(20);
  for (const event of events.reverse()) {
    await createForUsers([userId], platformEventNotification(event));
  }
}

async function listForUser(userId, query = {}) {
  await ensurePlatformHistory(userId);
  const filter = { $or: [{ expires_at: null }, { expires_at: { $gt: new Date() } }] };
  if (String(query.unread) === 'true') filter.read_at = null;
  if (query.cursor) filter._id = { $lt: query.cursor };
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const rows = await notificationRepository.listForUser(userId, filter, limit + 1);
  const items = rows.slice(0, limit);
  return {
    items,
    next_cursor: rows.length > limit ? String(items[items.length - 1]._id) : null
  };
}

async function unreadCount(userId) {
  await ensurePlatformHistory(userId);
  return notificationRepository.countUnread(userId, new Date());
}

module.exports = {
  createForUsers,
  createForOrganization,
  createForPlatformAdmins,
  platformEventNotification,
  ensurePlatformHistory,
  listForUser,
  unreadCount,
  markRead: notificationRepository.markRead,
  markAllRead: notificationRepository.markAllRead
};
