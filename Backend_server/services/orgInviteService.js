// B5 — Token + lifecycle lời mời thành viên tổ chức
const crypto = require('crypto');
const OrganizationInvite = require('../models/OrganizationInvite');
const Organization = require('../models/Organization');
const OrganizationJoinRequest = require('../models/OrganizationJoinRequest');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { assertCanCreateUser } = require('../utils/planQuota');
const { sendOrgInviteEmail, isSmtpConfigured } = require('./mailService');
const { getPublicBaseUrl } = require('./mailService');

const INVITE_TTL_MS = Number(process.env.ORG_INVITE_TTL_MS) || 7 * 24 * 60 * 60 * 1000;
const INVITE_ROLES = require('../models/OrganizationInvite').INVITE_ROLES;

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function shouldExposeInviteToken(opts = {}) {
  if (process.env.ORG_INVITE_TOKEN_IN_RESPONSE === 'true') return true;
  if (process.env.ORG_INVITE_TOKEN_IN_RESPONSE === 'false') return false;
  // Production chỉ ẩn token khi mail thật đã gửi; test/dev luôn trả để sandbox nhận lời mời.
  if (process.env.NODE_ENV === 'production' && opts.emailSent) return false;
  return process.env.NODE_ENV !== 'production';
}

function buildAcceptUrl(rawToken) {
  const base = getPublicBaseUrl();
  return `${base}/admin/dashboard.html#accept-invite=${encodeURIComponent(rawToken)}`;
}

async function createInvite({ org, email, role = 'BUILDING_ADMIN', invitedBy, note = '' }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw Object.assign(new Error('Email lời mời không hợp lệ.'), { status: 400, code: 'INVALID_EMAIL' });
  }
  const nextRole = String(role || 'BUILDING_ADMIN').toUpperCase();
  if (!INVITE_ROLES.includes(nextRole)) {
    throw Object.assign(new Error('Role lời mời không hợp lệ.'), { status: 400, code: 'INVALID_ROLE' });
  }

  const existingUser = await User.findOne({ email: normalizedEmail }).select('role organization_id').lean();
  if (existingUser) {
    if (existingUser.organization_id && String(existingUser.organization_id) === String(org._id)) {
      throw Object.assign(new Error('Người dùng đã thuộc tổ chức này.'), {
        status: 409,
        code: 'ALREADY_MEMBER'
      });
    }
    if (existingUser.organization_id) {
      throw Object.assign(new Error('Người dùng đã thuộc một tổ chức khác.'), {
        status: 409,
        code: 'USER_IN_OTHER_ORG'
      });
    }
    if (!['REGISTERED_USER'].includes(existingUser.role)) {
      throw Object.assign(new Error('Chỉ có thể mời tài khoản cá nhân (REGISTERED_USER).'), {
        status: 400,
        code: 'INVALID_USER_ROLE'
      });
    }
  }

  const pending = await OrganizationInvite.findOne({
    organization_id: org._id,
    email: normalizedEmail,
    status: 'PENDING'
  }).lean();
  if (pending) {
    throw Object.assign(new Error('Đã có lời mời đang chờ cho email này.'), {
      status: 409,
      code: 'INVITE_PENDING'
    });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const invite = await OrganizationInvite.create({
    organization_id: org._id,
    email: normalizedEmail,
    role: nextRole,
    token_hash: hashToken(rawToken),
    expires_at: new Date(Date.now() + INVITE_TTL_MS),
    status: 'PENDING',
    invited_by: invitedBy || null,
    note: String(note || '').slice(0, 300)
  });

  let mailResult = null;
  try {
    mailResult = await sendOrgInviteEmail({
      to: normalizedEmail,
      orgName: org.name,
      role: nextRole,
      acceptUrl: buildAcceptUrl(rawToken),
      expiresAt: invite.expires_at
    });
  } catch (e) {
    console.warn('sendOrgInviteEmail:', e.message);
  }
  const emailSent = Boolean(mailResult && (mailResult.sent || mailResult.stub));
  const realSmtpDelivered = Boolean(mailResult?.sent) && !mailResult?.stub && isSmtpConfigured();
  const exposeToken = shouldExposeInviteToken({ emailSent: realSmtpDelivered });

  ActivityLog.create({
    user_id: invitedBy || null,
    action: 'MEMBER_INVITED',
    target_type: 'organization',
    target_id: String(org._id),
    target: org.name,
    details: {
      invite_id: String(invite._id),
      email: normalizedEmail,
      role: nextRole,
      email_sent: emailSent
    },
    organization_id: org._id
  }).catch(() => {});

  return {
    invite,
    rawToken: exposeToken ? rawToken : undefined,
    email_sent: emailSent,
    accept_url: exposeToken ? buildAcceptUrl(rawToken) : undefined
  };
}

async function listInvites(orgId, status = 'PENDING') {
  const filter = { organization_id: orgId };
  if (status && status !== 'ALL') filter.status = String(status).toUpperCase();
  return OrganizationInvite.find(filter)
    .sort({ createdAt: -1 })
    .populate('invited_by', 'email full_name')
    .populate('accepted_by', 'email full_name')
    .lean();
}

async function revokeInvite(orgId, inviteId, revokedBy) {
  const invite = await OrganizationInvite.findOne({
    _id: inviteId,
    organization_id: orgId
  });
  if (!invite) {
    throw Object.assign(new Error('Không tìm thấy lời mời.'), { status: 404 });
  }
  if (invite.status !== 'PENDING') {
    throw Object.assign(new Error(`Lời mời đang ở trạng thái ${invite.status}.`), {
      status: 400,
      code: 'INVITE_NOT_PENDING'
    });
  }
  invite.status = 'REVOKED';
  await invite.save();
  ActivityLog.create({
    user_id: revokedBy || null,
    action: 'MEMBER_INVITE_REVOKED',
    target_type: 'organization',
    target_id: String(orgId),
    details: { invite_id: String(invite._id), email: invite.email },
    organization_id: orgId
  }).catch(() => {});
  return invite;
}

async function findValidInviteByToken(rawToken) {
  if (!rawToken) return null;
  const invite = await OrganizationInvite.findOne({
    token_hash: hashToken(rawToken),
    status: 'PENDING'
  }).select('+token_hash');
  if (!invite) return null;
  if (invite.expires_at && invite.expires_at.getTime() <= Date.now()) {
    invite.status = 'EXPIRED';
    await invite.save();
    return null;
  }
  return invite;
}

async function previewInvite(rawToken) {
  const invite = await findValidInviteByToken(rawToken);
  if (!invite) {
    throw Object.assign(new Error('Lời mời không hợp lệ hoặc đã hết hạn.'), {
      status: 400,
      code: 'INVITE_INVALID'
    });
  }
  const org = await Organization.findById(invite.organization_id).select('name slug').lean();
  return {
    email: invite.email,
    role: invite.role,
    expires_at: invite.expires_at,
    organization: org ? { id: String(org._id), name: org.name, slug: org.slug } : null
  };
}

async function acceptInvite({ rawToken, userId }) {
  const invite = await findValidInviteByToken(rawToken);
  if (!invite) {
    throw Object.assign(new Error('Lời mời không hợp lệ hoặc đã hết hạn.'), {
      status: 400,
      code: 'INVITE_INVALID'
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404 });
  }
  if (String(user.email || '').toLowerCase() !== invite.email) {
    throw Object.assign(new Error('Email đăng nhập không khớp lời mời.'), {
      status: 400,
      code: 'EMAIL_MISMATCH'
    });
  }
  if (user.role !== 'REGISTERED_USER' || user.organization_id) {
    throw Object.assign(new Error('Chỉ tài khoản cá nhân chưa thuộc tổ chức mới được nhận lời mời.'), {
      status: 400,
      code: 'USER_NOT_ELIGIBLE'
    });
  }

  const org = await Organization.findById(invite.organization_id);
  if (!org || org.is_active === false) {
    throw Object.assign(new Error('Tổ chức không khả dụng.'), { status: 400, code: 'ORG_INACTIVE' });
  }

  const quota = await assertCanCreateUser(org);
  if (quota && quota.ok === false) {
    throw Object.assign(new Error(quota.message || 'Tổ chức đã đạt hạn mức người dùng.'), {
      status: 403,
      code: 'QUOTA_EXCEEDED'
    });
  }

  user.role = invite.role;
  user.organization_id = org._id;
  user.session_version = (Number(user.session_version) || 0) + 1;
  await user.save();

  invite.status = 'ACCEPTED';
  invite.accepted_by = user._id;
  invite.accepted_at = new Date();
  await invite.save();

  await OrganizationJoinRequest.updateMany(
    { user_id: user._id, status: 'PENDING' },
    { $set: { status: 'CANCELLED', decided_at: new Date() } }
  );

  ActivityLog.create({
    user_id: user._id,
    action: 'MEMBER_INVITE_ACCEPTED',
    target_type: 'organization',
    target_id: String(org._id),
    target: org.name,
    details: {
      invite_id: String(invite._id),
      role: invite.role,
      email: invite.email
    },
    organization_id: org._id
  }).catch(() => {});

  return {
    user: {
      id: String(user._id),
      email: user.email,
      role: user.role,
      organization_id: String(org._id)
    },
    organization: {
      id: String(org._id),
      name: org.name,
      slug: org.slug
    },
    invite: {
      id: String(invite._id),
      role: invite.role,
      status: invite.status
    }
  };
}

module.exports = {
  INVITE_TTL_MS,
  createInvite,
  listInvites,
  revokeInvite,
  previewInvite,
  acceptInvite,
  hashToken,
  shouldExposeInviteToken
};
