const {
  createContactRequest,
  listContactRequests,
  getContactRequest,
  updateContactRequest,
  replyContactRequest,
  deleteContactRequest,
  contactStats,
  unreadCount,
  REQUEST_TYPES
} = require('../services/contactCrmService');

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.ip || '';
}

function actorFromReq(req) {
  return {
    _id: req.user?._id || req.user?.userId || null,
    full_name: req.user?.full_name || '',
    email: req.user?.email || ''
  };
}

async function submitContact(req, res) {
  try {
    const item = await createContactRequest(req.body || {}, {
      source: 'landing',
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 400)
    });
    res.status(201).json({
      message: 'Đã gửi liên hệ. Yêu cầu đã được lưu vào hệ thống.',
      id: item.id,
      createdAt: item.created_at,
      item
    });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('submitContact:', e);
    res.status(status).json({ message: e.message || 'Không gửi được liên hệ. Vui lòng thử lại.' });
  }
}

async function listContacts(req, res) {
  try {
    const data = await listContactRequests({
      status: req.query.status,
      request_type: req.query.request_type || req.query.type,
      q: req.query.q,
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 30
    });
    res.json(data);
  } catch (e) {
    console.error('listContacts:', e);
    res.status(500).json({ message: e.message });
  }
}

async function getContact(req, res) {
  try {
    res.json({ item: await getContactRequest(req.params.id) });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('getContact:', e);
    res.status(status).json({ message: e.message });
  }
}

async function updateContact(req, res) {
  try {
    const item = await updateContactRequest(req.params.id, req.body || {}, actorFromReq(req));
    res.json({ message: 'Đã cập nhật.', item });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('updateContact:', e);
    res.status(status).json({ message: e.message });
  }
}

// Giữ tương thích PATCH cũ chỉ đổi status
async function updateContactStatus(req, res) {
  try {
    const item = await updateContactRequest(
      req.params.id,
      { status: req.body?.status },
      actorFromReq(req)
    );
    res.json({ message: 'Đã cập nhật.', item });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('updateContactStatus:', e);
    res.status(status).json({ message: e.message });
  }
}

async function replyContact(req, res) {
  try {
    const result = await replyContactRequest(
      req.params.id,
      { subject: req.body?.subject, body: req.body?.body || req.body?.message },
      actorFromReq(req)
    );
    res.json({
      message: result.mail?.sent
        ? 'Đã phản hồi và gửi email.'
        : 'Đã lưu phản hồi (email thông báo tùy chọn chưa gửi được).',
      ...result
    });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('replyContact:', e);
    res.status(status).json({ message: e.message });
  }
}

async function removeContact(req, res) {
  try {
    await deleteContactRequest(req.params.id, actorFromReq(req));
    res.json({ message: 'Đã xóa yêu cầu liên hệ.' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('removeContact:', e);
    res.status(status).json({ message: e.message });
  }
}

async function getContactStats(req, res) {
  try {
    res.json(await contactStats());
  } catch (e) {
    console.error('getContactStats:', e);
    res.status(500).json({ message: e.message });
  }
}

async function getContactUnread(req, res) {
  try {
    const count = await unreadCount();
    res.json({ count, request_types: REQUEST_TYPES });
  } catch (e) {
    console.error('getContactUnread:', e);
    res.status(500).json({ message: e.message });
  }
}

module.exports = {
  submitContact,
  listContacts,
  getContact,
  updateContact,
  updateContactStatus,
  replyContact,
  removeContact,
  getContactStats,
  getContactUnread
};
