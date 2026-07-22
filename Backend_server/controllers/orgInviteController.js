const {
  createInvite,
  listInvites,
  revokeInvite,
  previewInvite,
  acceptInvite
} = require('../application/identity/inviteApplicationService');

function context(req) {
  return {
    principal: req.effectivePrincipal,
    ipAddress: req.actorContext?.ipAddress || req.ip || ''
  };
}

function sendError(res, error) {
  return res.status(error.status || 500).json({
    message: error.message || 'Lỗi máy chủ.',
    code: error.code
  });
}

async function postInvite(req, res) {
  try {
    const result = await createInvite(req.body || {}, context(req));
    return res.status(201).json({
      message: 'Đã tạo lời mời thành viên.',
      invite: {
        id: String(result.invite._id),
        email: result.invite.email,
        role: result.invite.role,
        status: result.invite.status,
        expires_at: result.invite.expires_at
      },
      email_sent: result.email_sent,
      invite_token: result.rawToken
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getInvites(req, res) {
  try {
    const rows = await listInvites(req.effectivePrincipal, req.query.status);
    return res.json({ items: rows.map((row) => ({
      id: String(row._id),
      email: row.email,
      role: row.role,
      status: row.status,
      expires_at: row.expires_at,
      created_at: row.createdAt,
      invited_by: row.invited_by
        ? { id: String(row.invited_by._id), email: row.invited_by.email }
        : null,
      accepted_by: row.accepted_by
        ? { id: String(row.accepted_by._id), email: row.accepted_by.email }
        : null,
      accepted_at: row.accepted_at
    })) });
  } catch (error) {
    return sendError(res, error);
  }
}

async function postRevoke(req, res) {
  try {
    const invite = await revokeInvite(req.effectivePrincipal, req.params.id, context(req));
    return res.json({
      message: 'Đã hủy lời mời.',
      invite: { id: String(invite._id), email: invite.email, status: invite.status }
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getAcceptPreview(req, res) {
  try {
    return res.json(await previewInvite(req.query.token));
  } catch (error) {
    return sendError(res, error);
  }
}

async function postAccept(req, res) {
  try {
    const result = await acceptInvite(
      req.body?.token || req.query?.token,
      req.user.userId,
      context(req)
    );
    return res.json({ message: 'Đã nhận lời mời. Bạn đã được gắn vào tổ chức.', ...result });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  postInvite,
  getInvites,
  postRevoke,
  getAcceptPreview,
  postAccept
};
