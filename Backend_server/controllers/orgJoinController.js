// ============================================
// FILE: orgJoinController.js
// MỤC ĐÍCH: Luồng REGISTERED_USER xin tham gia tổ chức; ORG_ADMIN duyệt.
// Duyệt → user trở thành BUILDING_ADMIN thuộc tổ chức.
// ============================================

const OrganizationJoinRequest = require('../models/OrganizationJoinRequest');
const Organization = require('../models/Organization');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { assertCanCreateUser } = require('../utils/planQuota');

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

// POST /api/org-join-requests — REGISTERED_USER gửi yêu cầu tham gia (bằng slug hoặc organization_id)
async function requestJoin(req, res) {
  try {
    if (!req.user || req.user.role !== 'REGISTERED_USER') {
      return res.status(403).json({ message: 'Chỉ tài khoản cá nhân mới được gửi yêu cầu tham gia tổ chức.' });
    }
    const user = await User.findById(req.user.userId).select('_id role organization_id email').lean();
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    if (user.organization_id) {
      return res.status(400).json({ message: 'Tài khoản đã thuộc một tổ chức.' });
    }

    const slug = req.body?.slug ? String(req.body.slug).trim().toLowerCase() : null;
    const orgId = req.body?.organization_id || null;
    let org = null;
    if (orgId) {
      org = await Organization.findById(orgId).select('_id name slug is_active').lean();
    } else if (slug) {
      org = await Organization.findOne({ slug }).select('_id name slug is_active').lean();
    }
    if (!org) {
      return res.status(404).json({ message: 'Không tìm thấy tổ chức. Kiểm tra lại mã tổ chức (slug).' });
    }
    if (org.is_active === false) {
      return res.status(400).json({ message: 'Tổ chức đang bị tạm dừng, không thể tham gia.' });
    }

    const existing = await OrganizationJoinRequest.findOne({
      user_id: user._id,
      organization_id: org._id,
      status: 'PENDING'
    }).lean();
    if (existing) {
      return res.status(409).json({ message: 'Bạn đã gửi yêu cầu tham gia tổ chức này và đang chờ duyệt.' });
    }

    const reqDoc = await OrganizationJoinRequest.create({
      user_id: user._id,
      organization_id: org._id,
      message: String(req.body?.message || '').slice(0, 500),
      status: 'PENDING'
    });

    logActivity({
      user_id: user._id,
      action: 'JOIN_ORG_REQUEST',
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name,
      details: { request_id: String(reqDoc._id), slug: org.slug },
      ip_address: req.ip || '',
      organization_id: String(org._id)
    });

    return res.status(201).json({
      message: 'Đã gửi yêu cầu tham gia. Vui lòng chờ quản trị tổ chức duyệt.',
      request: { _id: reqDoc._id, organization: { name: org.name, slug: org.slug }, status: reqDoc.status }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Bạn đã có yêu cầu đang chờ duyệt cho tổ chức này.' });
    }
    console.error('requestJoin:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/org-join-requests/mine — REGISTERED_USER xem yêu cầu của mình
async function listMyRequests(req, res) {
  try {
    const rows = await OrganizationJoinRequest.find({ user_id: req.user.userId })
      .sort({ createdAt: -1 })
      .populate('organization_id', 'name slug')
      .lean();
    return res.status(200).json(rows.map(r => ({
      _id: r._id,
      organization: r.organization_id ? { name: r.organization_id.name, slug: r.organization_id.slug } : null,
      status: r.status,
      created_at: r.createdAt,
      decided_at: r.decided_at
    })));
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/org-join-requests — ORG_ADMIN xem yêu cầu PENDING của tổ chức mình
async function listPendingForOrg(req, res) {
  try {
    if (!req.user || req.user.role !== 'ORG_ADMIN') {
      return res.status(403).json({ message: 'Chỉ ORG_ADMIN được xem yêu cầu tham gia.' });
    }
    if (!req.user.organization_id) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán tổ chức.' });
    }
    const status = String(req.query.status || 'PENDING').toUpperCase();
    const rows = await OrganizationJoinRequest.find({
      organization_id: req.user.organization_id,
      status
    })
      .sort({ createdAt: -1 })
      .populate('user_id', 'email full_name')
      .lean();
    return res.status(200).json(rows.map(r => ({
      _id: r._id,
      user: r.user_id ? { id: r.user_id._id, email: r.user_id.email, full_name: r.user_id.full_name } : null,
      message: r.message,
      status: r.status,
      created_at: r.createdAt
    })));
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/org-join-requests/:id/approve — ORG_ADMIN duyệt → user thành BUILDING_ADMIN
async function approveRequest(req, res) {
  try {
    if (!req.user || req.user.role !== 'ORG_ADMIN') {
      return res.status(403).json({ message: 'Chỉ ORG_ADMIN được duyệt yêu cầu.' });
    }
    const reqDoc = await OrganizationJoinRequest.findById(req.params.id);
    if (!reqDoc) return res.status(404).json({ message: 'Không tìm thấy yêu cầu.' });
    if (String(reqDoc.organization_id) !== String(req.user.organization_id)) {
      return res.status(403).json({ message: 'Yêu cầu không thuộc tổ chức của bạn.' });
    }
    if (reqDoc.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu đã được xử lý trước đó.' });
    }

    const org = await Organization.findById(reqDoc.organization_id);
    if (!org || org.is_active === false) {
      return res.status(400).json({ message: 'Tổ chức không khả dụng.' });
    }

    // Kiểm tra hạn mức số tài khoản của tổ chức
    const quota = await assertCanCreateUser(org);
    if (!quota.ok) {
      return res.status(403).json({ message: quota.message, code: quota.code, usage: quota.usage });
    }

    const targetUser = await User.findById(reqDoc.user_id);
    if (!targetUser) {
      reqDoc.status = 'REJECTED';
      reqDoc.decided_by = req.user.userId;
      reqDoc.decided_at = new Date();
      await reqDoc.save();
      return res.status(404).json({ message: 'Người dùng không còn tồn tại.' });
    }
    if (targetUser.role !== 'REGISTERED_USER' || targetUser.organization_id) {
      reqDoc.status = 'REJECTED';
      reqDoc.decided_by = req.user.userId;
      reqDoc.decided_at = new Date();
      await reqDoc.save();
      return res.status(400).json({ message: 'Người dùng đã thuộc tổ chức khác hoặc không còn là tài khoản cá nhân.' });
    }

    // Nâng cấp thành BUILDING_ADMIN thuộc tổ chức; bump session để token cũ hết hiệu lực
    targetUser.role = 'BUILDING_ADMIN';
    targetUser.organization_id = org._id;
    targetUser.session_version = (Number(targetUser.session_version) || 0) + 1;
    await targetUser.save();

    reqDoc.status = 'APPROVED';
    reqDoc.decided_by = req.user.userId;
    reqDoc.decided_at = new Date();
    await reqDoc.save();

    // Tự động từ chối các yêu cầu PENDING khác của user này (đã có tổ chức)
    await OrganizationJoinRequest.updateMany(
      { user_id: targetUser._id, status: 'PENDING', _id: { $ne: reqDoc._id } },
      { $set: { status: 'REJECTED', decided_at: new Date() } }
    );

    logActivity({
      user_id: req.user.userId,
      action: 'JOIN_ORG_APPROVE',
      target_type: 'user',
      target_id: String(targetUser._id),
      target: targetUser.email,
      details: { request_id: String(reqDoc._id), new_role: 'BUILDING_ADMIN' },
      ip_address: req.ip || '',
      organization_id: String(org._id)
    });

    return res.status(200).json({
      message: 'Đã duyệt. Người dùng trở thành Quản trị tòa nhà của tổ chức.',
      user: { id: targetUser._id, email: targetUser.email, role: targetUser.role }
    });
  } catch (error) {
    console.error('approveRequest:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/org-join-requests/:id/reject — ORG_ADMIN từ chối
async function rejectRequest(req, res) {
  try {
    if (!req.user || req.user.role !== 'ORG_ADMIN') {
      return res.status(403).json({ message: 'Chỉ ORG_ADMIN được từ chối yêu cầu.' });
    }
    const reqDoc = await OrganizationJoinRequest.findById(req.params.id);
    if (!reqDoc) return res.status(404).json({ message: 'Không tìm thấy yêu cầu.' });
    if (String(reqDoc.organization_id) !== String(req.user.organization_id)) {
      return res.status(403).json({ message: 'Yêu cầu không thuộc tổ chức của bạn.' });
    }
    if (reqDoc.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu đã được xử lý trước đó.' });
    }
    reqDoc.status = 'REJECTED';
    reqDoc.decided_by = req.user.userId;
    reqDoc.decided_at = new Date();
    await reqDoc.save();

    logActivity({
      user_id: req.user.userId,
      action: 'JOIN_ORG_REJECT',
      target_type: 'user',
      target_id: String(reqDoc.user_id),
      target: String(reqDoc.user_id),
      details: { request_id: String(reqDoc._id) },
      ip_address: req.ip || '',
      organization_id: String(reqDoc.organization_id)
    });

    return res.status(200).json({ message: 'Đã từ chối yêu cầu tham gia.' });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  requestJoin,
  listMyRequests,
  listPendingForOrg,
  approveRequest,
  rejectRequest
};
