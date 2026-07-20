const ContactMessage = require('../models/ContactMessage');
const User = require('../models/User');
const { isSmtpConfigured, getTransporter } = require('./mailService');

const REQUEST_TYPES = {
  DEMO: 'Đăng ký Demo',
  CONSULT: 'Tư vấn triển khai',
  PRICING: 'Báo giá',
  SUPPORT: 'Hỗ trợ kỹ thuật',
  BUG: 'Báo lỗi',
  OTHER: 'Khác'
};

const STATUS_LABELS = {
  NEW: 'Mới',
  IN_PROGRESS: 'Đang xử lý',
  REPLIED: 'Đã phản hồi',
  CLOSED: 'Đã đóng',
  SPAM: 'Spam'
};

function normalizeStatus(status) {
  const raw = String(status || 'NEW').toUpperCase();
  if (raw === 'READ') return 'IN_PROGRESS';
  if (raw === 'ARCHIVED') return 'CLOSED';
  if (['NEW', 'IN_PROGRESS', 'REPLIED', 'CLOSED', 'SPAM'].includes(raw)) return raw;
  return 'NEW';
}

function normalizeRequestType(input, formType) {
  const raw = String(input || '').toUpperCase();
  if (REQUEST_TYPES[raw]) return raw;
  const legacy = String(formType || '').toUpperCase();
  if (legacy === 'DEMO') return 'DEMO';
  if (legacy === 'REGISTER') return 'CONSULT';
  if (legacy === 'NEWSLETTER') return 'OTHER';
  return 'OTHER';
}

function formatRelative(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return mins + ' phút trước';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' giờ trước';
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  if (days < 30) return days + ' ngày trước';
  return new Date(date).toLocaleDateString('vi-VN');
}

function pushHistory(doc, action, detail, actor) {
  doc.history = Array.isArray(doc.history) ? doc.history : [];
  doc.history.push({
    at: new Date(),
    action,
    detail: detail || '',
    actor_id: actor?._id || actor?.userId || null,
    actor_name: actor?.full_name || actor?.email || (actor ? 'Admin' : 'Hệ thống')
  });
}

function serialize(doc) {
  const item = doc.toObject ? doc.toObject() : { ...doc };
  const status = normalizeStatus(item.status);
  const request_type = normalizeRequestType(item.request_type, item.form_type);
  return {
    id: String(item._id),
    full_name: item.name,
    name: item.name,
    email: item.email,
    phone: item.phone || '',
    company: item.company || '',
    website: item.website || '',
    subject: item.subject || REQUEST_TYPES[request_type] || 'Liên hệ',
    message: item.message,
    source: item.source || 'landing',
    request_type,
    request_type_label: REQUEST_TYPES[request_type] || request_type,
    status,
    status_label: STATUS_LABELS[status] || status,
    assigned_to: item.assigned_to
      ? {
          id: String(item.assigned_to._id || item.assigned_to),
          name: item.assigned_to.full_name || item.assigned_to.email || ''
        }
      : null,
    note: item.note || '',
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    replied_at: item.replied_at,
    closed_at: item.closed_at,
    created_label: formatRelative(item.createdAt),
    ip_address: item.ip_address || '',
    user_agent: item.user_agent || '',
    history: (item.history || []).map((h) => ({
      at: h.at,
      at_label: formatRelative(h.at),
      action: h.action,
      detail: h.detail || '',
      actor_name: h.actor_name || ''
    }))
  };
}

async function optionalNotifyAdmins(doc) {
  if (!isSmtpConfigured()) return { sent: false, reason: 'smtp_not_configured' };
  const transporter = getTransporter && getTransporter();
  if (!transporter) return { sent: false, reason: 'no_transporter' };
  const to = process.env.CONTACT_NOTIFY_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!to) return { sent: false, reason: 'no_recipient' };
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: '[IndoorNav] Liên hệ mới: ' + (doc.subject || doc.name),
      text:
        'Có liên hệ mới từ Landing.\n\n' +
        'Họ tên: ' + doc.name + '\n' +
        'Email: ' + doc.email + '\n' +
        'Loại: ' + (REQUEST_TYPES[doc.request_type] || doc.request_type) + '\n' +
        'Chủ đề: ' + (doc.subject || '') + '\n\n' +
        doc.message + '\n\n' +
        'Xử lý trong Admin → Website → Liên hệ.'
    });
    return { sent: true };
  } catch (error) {
    console.warn('contact notify email failed:', error.message);
    return { sent: false, reason: error.message };
  }
}

async function createContactRequest(payload, meta = {}) {
  const name = String(payload.full_name || payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const message = String(payload.message || '').trim();
  const phone = String(payload.phone || '').trim();
  const company = String(payload.company || '').trim();
  const website = String(payload.website || '').trim();
  const request_type = normalizeRequestType(payload.request_type || payload.form_type);
  const subject = String(payload.subject || REQUEST_TYPES[request_type] || 'Liên hệ').trim();

  if (!name || name.length < 2) {
    const err = new Error('Họ tên không hợp lệ (tối thiểu 2 ký tự).');
    err.status = 400;
    throw err;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Email không hợp lệ.');
    err.status = 400;
    throw err;
  }
  if (!message || message.length < 10) {
    const err = new Error('Nội dung quá ngắn (tối thiểu 10 ký tự).');
    err.status = 400;
    throw err;
  }
  if (message.length > 4000) {
    const err = new Error('Nội dung quá dài (tối đa 4000 ký tự).');
    err.status = 400;
    throw err;
  }

  const doc = new ContactMessage({
    name,
    email,
    message,
    phone,
    company,
    website,
    subject,
    request_type,
    form_type: request_type === 'DEMO' ? 'DEMO' : 'CONTACT',
    status: 'NEW',
    source: meta.source || 'landing',
    ip_address: meta.ip || '',
    user_agent: meta.userAgent || '',
    history: [{
      at: new Date(),
      action: 'SUBMITTED',
      detail: 'Gửi form từ Landing',
      actor_name: name
    }]
  });
  await doc.save();
  optionalNotifyAdmins(doc).catch(() => {});
  return serialize(doc);
}

async function listContactRequests({ status, request_type, q, page = 1, limit = 30 } = {}) {
  const filter = {};
  if (status && status !== 'ALL') {
    const st = normalizeStatus(status);
    if (st === 'IN_PROGRESS') filter.status = { $in: ['IN_PROGRESS', 'READ'] };
    else if (st === 'CLOSED') filter.status = { $in: ['CLOSED', 'ARCHIVED'] };
    else filter.status = st;
  }
  if (request_type && request_type !== 'ALL') {
    filter.request_type = normalizeRequestType(request_type);
  }
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { company: rx }, { subject: rx }, { message: rx }];
  }

  const skip = (Math.max(1, page) - 1) * Math.min(Math.max(limit, 1), 100);
  const take = Math.min(Math.max(limit, 1), 100);
  const [rows, total, counts] = await Promise.all([
    ContactMessage.find(filter)
      .populate('assigned_to', 'full_name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(take),
    ContactMessage.countDocuments(filter),
    ContactMessage.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);

  const status_counts = { ALL: 0, NEW: 0, IN_PROGRESS: 0, REPLIED: 0, CLOSED: 0, SPAM: 0 };
  counts.forEach((row) => {
    const key = normalizeStatus(row._id);
    status_counts[key] = (status_counts[key] || 0) + row.count;
    status_counts.ALL += row.count;
  });

  return {
    items: rows.map(serialize),
    total,
    page: Math.max(1, page),
    limit: take,
    status_counts,
    request_types: REQUEST_TYPES
  };
}

async function getContactRequest(id) {
  const doc = await ContactMessage.findById(id).populate('assigned_to', 'full_name email');
  if (!doc) {
    const err = new Error('Không tìm thấy liên hệ.');
    err.status = 404;
    throw err;
  }
  return serialize(doc);
}

async function updateContactRequest(id, patch, actor) {
  const doc = await ContactMessage.findById(id);
  if (!doc) {
    const err = new Error('Không tìm thấy liên hệ.');
    err.status = 404;
    throw err;
  }

  if (patch.note !== undefined) {
    doc.note = String(patch.note || '').slice(0, 4000);
    pushHistory(doc, 'NOTE_UPDATED', 'Cập nhật ghi chú nội bộ', actor);
  }

  if (patch.status) {
    const next = normalizeStatus(patch.status);
    const prev = normalizeStatus(doc.status);
    if (next !== prev) {
      doc.status = next;
      if (next === 'REPLIED' && !doc.replied_at) doc.replied_at = new Date();
      if (next === 'CLOSED') doc.closed_at = new Date();
      pushHistory(doc, 'STATUS_CHANGED', `${STATUS_LABELS[prev] || prev} → ${STATUS_LABELS[next] || next}`, actor);
    }
  }

  if (patch.assigned_to !== undefined) {
    const assigneeId = patch.assigned_to || null;
    doc.assigned_to = assigneeId;
    let label = 'Bỏ gán';
    if (assigneeId) {
      const user = await User.findById(assigneeId).select('full_name email').lean();
      label = 'Gán cho ' + (user?.full_name || user?.email || String(assigneeId));
    }
    pushHistory(doc, 'ASSIGNED', label, actor);
  }

  await doc.save();
  await doc.populate('assigned_to', 'full_name email');
  return serialize(doc);
}

async function replyContactRequest(id, { subject, body }, actor) {
  const doc = await ContactMessage.findById(id);
  if (!doc) {
    const err = new Error('Không tìm thấy liên hệ.');
    err.status = 404;
    throw err;
  }
  const text = String(body || '').trim();
  if (!text) {
    const err = new Error('Nội dung phản hồi trống.');
    err.status = 400;
    throw err;
  }

  let mailResult = { sent: false, reason: 'smtp_not_configured' };
  if (isSmtpConfigured()) {
    const transporter = getTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: doc.email,
          subject: String(subject || ('Re: ' + (doc.subject || 'Liên hệ IndoorNav'))).trim(),
          text
        });
        mailResult = { sent: true };
      } catch (error) {
        mailResult = { sent: false, reason: error.message };
      }
    }
  }

  doc.status = 'REPLIED';
  doc.replied_at = new Date();
  pushHistory(
    doc,
    'REPLIED',
    (mailResult.sent ? 'Đã gửi email phản hồi. ' : 'Đã ghi phản hồi (email chưa gửi). ') + text.slice(0, 500),
    actor
  );
  await doc.save();
  await doc.populate('assigned_to', 'full_name email');
  return { item: serialize(doc), mail: mailResult };
}

async function deleteContactRequest(id, actor) {
  const doc = await ContactMessage.findByIdAndDelete(id);
  if (!doc) {
    const err = new Error('Không tìm thấy liên hệ.');
    err.status = 404;
    throw err;
  }
  return { ok: true, id: String(id), deleted_by: actor?.email || null };
}

async function contactStats() {
  const startMonth = new Date();
  startMonth.setDate(1);
  startMonth.setHours(0, 0, 0, 0);
  const [byStatus, byType, monthCount, replied] = await Promise.all([
    ContactMessage.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ContactMessage.aggregate([{ $group: { _id: '$request_type', count: { $sum: 1 } } }]),
    ContactMessage.countDocuments({ createdAt: { $gte: startMonth } }),
    ContactMessage.find({ replied_at: { $ne: null } }).select('createdAt replied_at').limit(500).lean()
  ]);

  const status = { NEW: 0, IN_PROGRESS: 0, REPLIED: 0, CLOSED: 0, SPAM: 0, total: 0 };
  byStatus.forEach((row) => {
    const key = normalizeStatus(row._id);
    status[key] = (status[key] || 0) + row.count;
    status.total += row.count;
  });

  const types = {};
  Object.keys(REQUEST_TYPES).forEach((key) => { types[key] = 0; });
  byType.forEach((row) => {
    const key = normalizeRequestType(row._id);
    types[key] = (types[key] || 0) + row.count;
  });

  let avgHours = null;
  if (replied.length) {
    const sum = replied.reduce((acc, row) => acc + (new Date(row.replied_at) - new Date(row.createdAt)), 0);
    avgHours = Math.round((sum / replied.length) / 3600000 * 10) / 10;
  }

  return {
    status,
    types,
    month_count: monthCount,
    avg_reply_hours: avgHours
  };
}

async function unreadCount() {
  return ContactMessage.countDocuments({ status: 'NEW' });
}

module.exports = {
  REQUEST_TYPES,
  STATUS_LABELS,
  normalizeStatus,
  normalizeRequestType,
  createContactRequest,
  listContactRequests,
  getContactRequest,
  updateContactRequest,
  replyContactRequest,
  deleteContactRequest,
  contactStats,
  unreadCount,
  serialize
};
