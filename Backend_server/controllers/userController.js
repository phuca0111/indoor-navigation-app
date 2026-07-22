const {
  getMe: getMeUseCase,
  listUsers: listUsersUseCase,
  getUser,
  updateProfile,
  changePassword: changePasswordUseCase,
  updateUser: updateUserUseCase,
  deactivateUser,
  adminResetPassword: adminResetPasswordUseCase
} = require('../application/identity/userApplicationService');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { validateFullName, normalizeFullName } = require('../utils/fullNamePolicy');
const { validateProfilePatch } = require('../utils/identityValidation');

function context(req) {
  return {
    principal: req.effectivePrincipal,
    ipAddress: req.actorContext?.ipAddress || req.ip || ''
  };
}

function errorResponse(res, error) {
  return res.status(error.status || 500).json({
    message: error.message || 'Lỗi máy chủ.',
    code: error.code
  });
}

async function getMe(req, res) {
  try {
    const user = await getMeUseCase(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    return res.status(200).json(user);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function updateMe(req, res) {
  try {
    const errors = validateProfilePatch(req.body || {});
    if (errors.length) return res.status(400).json({ message: 'Dữ liệu hồ sơ không hợp lệ.', errors });
    const update = {};
    if (req.body.full_name !== undefined) {
      const nameErrors = validateFullName(req.body.full_name);
      if (nameErrors.length) return res.status(400).json({ message: 'Họ tên không hợp lệ.', errors: nameErrors });
      update.full_name = normalizeFullName(req.body.full_name);
    }
    if (req.body.phone !== undefined) update.phone = req.body.phone;
    if (req.body.avatar_url !== undefined) update['avatar.url'] = req.body.avatar_url.trim();
    if (req.body.avatar_object_key !== undefined) update['avatar.object_key'] = req.body.avatar_object_key.trim();
    for (const [key, value] of Object.entries(req.body.preferences || {})) {
      update[`preferences.${key}`] = String(value).trim();
    }
    for (const [key, value] of Object.entries(req.body.notification_preferences || {})) {
      update[`notification_preferences.${key}`] = value;
    }
    if (!Object.keys(update).length) return res.status(400).json({ message: 'Không có dữ liệu để cập nhật.' });
    await updateProfile(req.user.userId, update, context(req));
    return res.status(200).json({ message: 'Cập nhật thông tin cá nhân thành công.' });
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Tất cả các trường đều bắt buộc.' });
    }
    const errors = validatePasswordStrength(newPassword);
    if (errors.length) return res.status(400).json({ message: 'Mật khẩu mới không đủ mạnh.', errors });
    if (newPassword !== confirmPassword) return res.status(400).json({ message: 'Xác nhận mật khẩu không khớp.' });
    if (!await changePasswordUseCase(req.user.userId, currentPassword, newPassword, context(req))) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng.' });
    }
    return res.status(200).json({ message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' });
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function listUsers(req, res) {
  try {
    return res.status(200).json(await listUsersUseCase(req.query || {}, req.effectivePrincipal));
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function getUserById(req, res) {
  try {
    const user = await getUser(req.params.userId, req.effectivePrincipal);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return res.status(200).json(user);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function updateUser(req, res) {
  try {
    if (req.body.email !== undefined || req.body.password !== undefined || req.body.created_by !== undefined) {
      return res.status(400).json({ message: 'Không thể cập nhật email, password, hoặc created_by thông qua API này.' });
    }
    const allowed = ['full_name', 'phone', 'role', 'is_active', 'assigned_buildings', 'organization_id'];
    const patch = Object.fromEntries(
      allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]])
    );
    if (patch.full_name !== undefined) {
      const errors = validateFullName(patch.full_name);
      if (errors.length) return res.status(400).json({ message: 'Họ tên không hợp lệ.', errors });
      patch.full_name = normalizeFullName(patch.full_name);
    }
    const validRoles = req.user.role === 'ORG_ADMIN'
      ? ['BUILDING_ADMIN']
      : ['SUPER_ADMIN', 'FINANCE_ADMIN', 'MARKETING_MANAGER', 'ORG_ADMIN', 'BUILDING_ADMIN'];
    if (patch.role !== undefined && !validRoles.includes(patch.role)) {
      return res.status(400).json({ message: `role phải là: ${validRoles.join(' hoặc ')}` });
    }
    if (patch.is_active !== undefined && typeof patch.is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active phải là boolean (true/false).' });
    }
    if (patch.assigned_buildings !== undefined && !Array.isArray(patch.assigned_buildings)) {
      return res.status(400).json({ message: 'assigned_buildings phải là mảng.' });
    }
    if (patch.phone !== undefined &&
        (typeof patch.phone !== 'string' || (patch.phone && !/^[0-9+\-\s]{1,20}$/.test(patch.phone)))) {
      return res.status(400).json({ message: 'Số điện thoại không hợp lệ.' });
    }
    const user = await updateUserUseCase(req.params.userId, patch, context(req));
    return res.status(200).json({ message: 'Cập nhật tài khoản thành công!', user });
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function deleteUser(req, res) {
  try {
    const user = await deactivateUser(req.params.userId, context(req));
    return res.status(200).json({ message: 'Đã khóa tài khoản (is_active = false).', user });
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function adminResetPassword(req, res) {
  try {
    const plain = await adminResetPasswordUseCase(
      req.params.userId,
      req.body?.newPassword,
      req.body?.generate,
      context(req)
    );
    return res.status(200).json({
      message: 'Đặt lại mật khẩu thành công.',
      temporary_password: plain
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = {
  getUsers: listUsers,
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
  changePassword,
  adminResetPassword
};
