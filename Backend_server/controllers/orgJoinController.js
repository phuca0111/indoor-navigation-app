const {
  requestJoin: requestJoinUseCase,
  listMine,
  listForOrganization,
  decide
} = require('../application/identity/joinApplicationService');

function context(req) {
  return {
    principal: req.effectivePrincipal,
    ipAddress: req.actorContext?.ipAddress || req.ip || ''
  };
}

function sendError(res, error) {
  return res.status(error.status || (error.code === 11000 ? 409 : 500)).json({
    message: error.message || 'Lỗi máy chủ.',
    code: error.code,
    usage: error.usage
  });
}

async function requestJoin(req, res) {
  try {
    const result = await requestJoinUseCase(req.body || {}, context(req));
    return res.status(201).json({
      message: 'Đã gửi yêu cầu tham gia. Vui lòng chờ quản trị tổ chức duyệt.',
      request: {
        _id: result.request._id,
        organization: {
          name: result.organization.name,
          slug: result.organization.slug
        },
        status: result.request.status
      }
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function listMyRequests(req, res) {
  try {
    const rows = await listMine(req.user.userId);
    return res.status(200).json(rows.map((row) => ({
      _id: row._id,
      organization: row.organization_id
        ? { name: row.organization_id.name, slug: row.organization_id.slug }
        : null,
      status: row.status,
      created_at: row.createdAt,
      decided_at: row.decided_at
    })));
  } catch (error) {
    return sendError(res, error);
  }
}

async function listPendingForOrg(req, res) {
  try {
    const rows = await listForOrganization(req.effectivePrincipal, req.query.status);
    return res.status(200).json(rows.map((row) => ({
      _id: row._id,
      user: row.user_id
        ? { id: row.user_id._id, email: row.user_id.email, full_name: row.user_id.full_name }
        : null,
      message: row.message,
      status: row.status,
      created_at: row.createdAt
    })));
  } catch (error) {
    return sendError(res, error);
  }
}

async function approveRequest(req, res) {
  try {
    const result = await decide(req.params.id, 'APPROVED', context(req));
    return res.status(200).json({
      message: 'Đã duyệt. Người dùng trở thành Quản trị tòa nhà của tổ chức.',
      user: {
        id: result.user._id,
        email: result.user.email,
        role: result.user.role
      }
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function rejectRequest(req, res) {
  try {
    await decide(req.params.id, 'REJECTED', context(req));
    return res.status(200).json({ message: 'Đã từ chối yêu cầu tham gia.' });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  requestJoin,
  listMyRequests,
  listPendingForOrg,
  approveRequest,
  rejectRequest
};
