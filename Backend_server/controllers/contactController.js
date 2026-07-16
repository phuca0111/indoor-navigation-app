// ============================================
// FILE: contactController.js
// MỤC ĐÍCH: Public submit + Super Admin inbox (WL3)
// ============================================

const ContactMessage = require('../models/ContactMessage');

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.ip || '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/contact — public
async function submitContact(req, res) {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const message = String(body.message || '').trim();
    const phone = String(body.phone || '').trim();

    if (!name || name.length < 2) {
      return res.status(400).json({ message: 'Họ tên không hợp lệ (tối thiểu 2 ký tự).' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: 'Email không hợp lệ.' });
    }
    if (!message || message.length < 10) {
      return res.status(400).json({ message: 'Nội dung quá ngắn (tối thiểu 10 ký tự).' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ message: 'Nội dung quá dài (tối đa 4000 ký tự).' });
    }

    const doc = await ContactMessage.create({
      name,
      email,
      message,
      phone,
      source: 'landing',
      ip_address: clientIp(req),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 400)
    });

    res.status(201).json({
      message: 'Đã gửi liên hệ. Chúng tôi sẽ phản hồi sớm.',
      id: doc._id,
      createdAt: doc.createdAt
    });
  } catch (e) {
    console.error('submitContact:', e);
    res.status(500).json({ message: 'Không gửi được liên hệ. Vui lòng thử lại.' });
  }
}

// GET /api/contact — Super Admin inbox
async function listContacts(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const filter = {};
    if (status && ['NEW', 'READ', 'ARCHIVED'].includes(status)) {
      filter.status = status;
    }
    const items = await ContactMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.status(200).json({ items, total: items.length });
  } catch (e) {
    console.error('listContacts:', e);
    res.status(500).json({ message: e.message });
  }
}

// PATCH /api/contact/:id — Super Admin đánh dấu đã đọc / archive
async function updateContactStatus(req, res) {
  try {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['NEW', 'READ', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ message: 'status phải là NEW | READ | ARCHIVED.' });
    }
    const doc = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy liên hệ.' });
    res.status(200).json({ message: 'Đã cập nhật.', item: doc });
  } catch (e) {
    console.error('updateContactStatus:', e);
    res.status(500).json({ message: e.message });
  }
}

module.exports = {
  submitContact,
  listContacts,
  updateContactStatus
};
