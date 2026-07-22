const {
  listMembers: listMembersUseCase,
  upsertMember: upsertMemberUseCase,
  removeMember: removeMemberUseCase,
  listDepartments: listDepartmentsUseCase,
  createDepartment: createDepartmentUseCase,
  updateDepartment: updateDepartmentUseCase
} = require('../application/identity/membershipApplicationService');

function context(req) {
  return {
    principal: req.effectivePrincipal,
    ipAddress: req.actorContext?.ipAddress || req.ip || ''
  };
}

function sendError(res, error) {
  return res.status(error.status || (error.code === 11000 ? 409 : 500)).json({
    message: error.message || 'Lỗi máy chủ.',
    code: error.code
  });
}

async function listMembers(req, res) {
  try {
    return res.status(200).json(await listMembersUseCase(
      req.params.organizationId,
      req.effectivePrincipal
    ));
  } catch (error) {
    return sendError(res, error);
  }
}

async function upsertMember(req, res) {
  try {
    if (!req.body?.user_id || !['ORG_ADMIN', 'BUILDING_ADMIN'].includes(req.body?.role)) {
      return res.status(400).json({ message: 'user_id hoặc role không hợp lệ.' });
    }
    const member = await upsertMemberUseCase(
      req.params.organizationId,
      req.body,
      context(req)
    );
    return res.status(200).json({ message: 'Đã cập nhật thành viên.', member });
  } catch (error) {
    return sendError(res, error);
  }
}

async function removeMember(req, res) {
  try {
    const member = await removeMemberUseCase(
      req.params.organizationId,
      req.params.memberId,
      context(req)
    );
    if (!member) {
      return res.status(404).json({ message: 'Không tìm thấy thành viên hoặc không thể tự xóa.' });
    }
    return res.status(200).json({ message: 'Đã xóa thành viên khỏi tổ chức.' });
  } catch (error) {
    return sendError(res, error);
  }
}

async function listDepartments(req, res) {
  try {
    return res.status(200).json(await listDepartmentsUseCase(
      req.params.organizationId,
      req.effectivePrincipal
    ));
  } catch (error) {
    return sendError(res, error);
  }
}

async function createDepartment(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (name.length < 2 || !/^[A-Z0-9_-]{2,40}$/.test(code)) {
      return res.status(400).json({ message: 'Tên hoặc code department không hợp lệ.' });
    }
    const department = await createDepartmentUseCase(req.params.organizationId, {
      name,
      code,
      description: String(req.body?.description || '').trim()
    }, context(req));
    return res.status(201).json({ message: 'Đã tạo department.', department });
  } catch (error) {
    return sendError(res, error);
  }
}

async function updateDepartment(req, res) {
  try {
    const update = {};
    if (req.body?.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body?.description !== undefined) update.description = String(req.body.description).trim();
    if (req.body?.is_active !== undefined) update.is_active = req.body.is_active === true;
    const department = await updateDepartmentUseCase(
      req.params.organizationId,
      req.params.departmentId,
      update,
      context(req)
    );
    if (!department) return res.status(404).json({ message: 'Không tìm thấy department.' });
    return res.status(200).json({ message: 'Đã cập nhật department.', department });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  listMembers,
  upsertMember,
  removeMember,
  listDepartments,
  createDepartment,
  updateDepartment
};
