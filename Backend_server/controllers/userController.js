// ============================================
// FILE: userController.js
// Má»¤C ÄÃCH: Xá»­ lÃ½ API quáº£n lÃ½ user cho Super Admin
// QUYá»€N: Chá»‰ SUPER_ADMIN má»›i Ä‘Æ°á»£c dÃ¹ng cÃ¡c API nÃ y
//
// CÃC API:
// - GET /api/users                    â†’ listUsers (cÃ³ filter)
// - GET /api/users/:id               â†’ getUserById
// - PUT /api/users/:id               â†’ updateUser (cháº·n self-update nguy hiá»ƒm)
// - DELETE /api/users/:id              â†’ deleteUser (soft delete: is_active=false)
//
// NOTE: getMe & updateMe & changePassword váº«n dÃ¹ng cho self-service (khÃ´ng Ä‘á»•i)
// ============================================

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getClientIp } = require('../utils/ipHelper');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Building = require('../models/Building');
const ActivityLog = require('../models/ActivityLog');
const { annotateUsersQuotaLockForList, annotateUsersQuotaLock } = require('../utils/overQuotaLock');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { validateFullName, normalizeFullName } = require('../utils/fullNamePolicy');

function logActivity(data) {
  return ActivityLog.create(data).catch(() => {});
}

async function getOrgAdminOrganizationId(req, res) {
  const me = await User.findById(req.user.userId).select('organization_id role').lean();
  if (!me?.organization_id) {
    res.status(403).json({ message: 'Tài khoản ORG_ADMIN chưa được gán tổ chức.' });
    return null;
  }
  return me.organization_id;
}

async function assertUserInOrgScope(req, res, targetUser) {
  if (req.user.role === 'SUPER_ADMIN') return true;
  if (req.user.role !== 'ORG_ADMIN') {
    res.status(403).json({ message: 'Không có quyền truy cập tài khoản này.' });
    return false;
  }
  const orgId = await getOrgAdminOrganizationId(req, res);
  if (!orgId) return false;
  if (!targetUser || String(targetUser.organization_id) !== String(orgId)) {
    res.status(403).json({ message: 'Bạn chỉ được quản lý user trong tổ chức của mình.' });
    return false;
  }
  if (targetUser.role === 'SUPER_ADMIN') {
    res.status(403).json({ message: 'Không thể truy cập tài khoản Super Admin.' });
    return false;
  }
  return true;
}

// ==========================================
// HÃ€M 0: Láº¤Y THÃ”NG TIN CÃ NHÃ‚N HIá»†N Táº I (GET /api/users/me)
// DÃ¹ng cho self-service, khÃ´ng Ä‘á»•i
// ==========================================
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password')
      .populate('organization_id', 'name slug is_active plan billing_status grace_ends_at plan_started_at plan_expires_at contact_phone contact_address')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng.' });
    }

    if (user.organization_id && typeof user.organization_id === 'object') {
      user.organization = user.organization_id;
      user.organization_id = user.organization._id;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ message: 'Lá»—i mÃ¡y chá»§: ' + error.message });
  }
};

// ==========================================
// HÃ€M 1: Cáº¬P NHáº¬T THÃ”NG TIN CÃ NHÃ‚N (PUT /api/users/me)
// DÃ¹ng cho self-service, khÃ´ng Ä‘á»•i
// ==========================================
const updateMe = async (req, res) => {
  try {
    const { full_name, phone } = req.body;

    const allowedUpdates = {};
    if (full_name !== undefined) {
      const nameErrors = validateFullName(full_name);
      if (nameErrors.length) {
        return res.status(400).json({ message: 'Họ tên không hợp lệ.', errors: nameErrors });
      }
      allowedUpdates.full_name = normalizeFullName(full_name);
    }
    if (phone !== undefined) {
      if (typeof phone !== 'string') {
        return res.status(400).json({ message: 'Số điện thoại phải là chuỗi.' });
      }
      allowedUpdates.phone = phone;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu để cập nhật.' });
    }

    const oldUser = await User.findById(req.user.userId).select('full_name phone').lean();

    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      allowedUpdates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    }

    const changes = {};
    if (oldUser.full_name !== updatedUser.full_name) {
      changes.full_name = { from: oldUser.full_name, to: updatedUser.full_name };
    }
    if (oldUser.phone !== updatedUser.phone) {
      changes.phone = { from: oldUser.phone, to: updatedUser.phone };
    }

    // Log UPDATE_PROFILE với chi tiết thay đổi
    logActivity({
      user_id: req.user.userId,
      action: 'UPDATE_PROFILE',
      target_type: 'user',
      target_id: String(updatedUser._id),
      target: updatedUser.email,
      details: changes,
      ip_address: getClientIp(req)
    }).catch(err => console.error('Failed to log UPDATE_PROFILE:', err));

    res.status(200).json({ message: 'Cập nhật thông tin cá nhân thành công.' });

  } catch (error) {
    console.error('UpdateMe error:', error);
    res.status(500).json({ message: 'Lỗi cập nhật thông tin: ' + error.message });
  }
};

// ==========================================
// HÃ€M 2: Äá»”I Máº¬T KHáº¢U (PUT /api/users/me/password)
// DÃ¹ng cho self-service, khÃ´ng Ä‘á»•i
// ==========================================
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Tất cả các trường đều bắt buộc.' });
    }
    const passwordErrors = validatePasswordStrength(newPassword);
    if (passwordErrors.length) {
      return res.status(400).json({
        message: 'Mật khẩu mới không đủ mạnh.',
        errors: passwordErrors
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Xác nhận mật khẩu không khớp.' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    }

    // Kiá»ƒm tra máº­t kháº©u hiá»‡n táº¡i (vá»›i tÆ°Æ¡ng thÃ­ch dev)
    let matKhauDung = await bcrypt.compare(currentPassword, user.password).catch(() => false);
    if (!matKhauDung && user.password !== currentPassword) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng.' });
    }

    // Cáº­p nháº­t máº­t kháº©u má»›i
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();

    logActivity({
      user_id: req.user.userId,
      action: 'CHANGE_PASSWORD',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      details: { message: 'Người dùng đã đổi mật khẩu' },
      ip_address: getClientIp(req)
    }).catch(err => console.error('Failed to log CHANGE_PASSWORD:', err));

    res.status(200).json({ message: 'Đổi mật khẩu thành công.' });
  } catch (error) {
    console.error('ChangePassword error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
};

// ==========================================
// HÃ€M 3: Láº¤Y DANH SÃCH USER Vá»šI FILTER (GET /api/users)
// CHá»ˆ SUPER_ADMIN Má»šI ÄÆ¯á»¢C DÃ™NG
// ==========================================
const listUsers = async (req, res) => {
  try {
    const { search, role, is_active } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { full_name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) {
      query.role = role;
    }
    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }

    if (req.user.role === 'ORG_ADMIN') {
      const orgId = await getOrgAdminOrganizationId(req, res);
      if (!orgId) return;
      query.organization_id = orgId;
      if (role === 'SUPER_ADMIN') {
        return res.status(200).json([]);
      }
      if (role) {
        query.role = role;
      } else {
        query.role = { $ne: 'SUPER_ADMIN' };
      }
    }

    let users = await User.find({
      ...query,
      _id: { $ne: req.user.userId }
    })
      .populate('assigned_buildings', 'name address')
      .select('-password')
      .lean();

    users = await annotateUsersQuotaLockForList(users);

    res.status(200).json(users);
  } catch (error) {
    console.error('ListUsers error:', error);
    res.status(500).json({ message: 'Lỗi lấy danh sách tài khoản: ' + error.message });
  }
};

// ==========================================
// HÃ€M 4: Láº¤Y CHI TIáº¾T 1 USER (GET /api/users/:id)
// CHá»ˆ SUPER_ADMIN Má»šI ÄÆ¯á»¢C DÃ™NG
// ==========================================
const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate('assigned_buildings', 'name address')
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    const allowed = await assertUserInOrgScope(req, res, user);
    if (!allowed) return;

    const org = user.organization_id
      ? await Organization.findById(user.organization_id)
      : null;
    let result = user;
    if (org) {
      const [annotated] = await annotateUsersQuotaLock(org, [user]);
      result = annotated;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('GetUserById error:', error);
    res.status(500).json({ message: 'Lá»—i mÃ¡y chá»§: ' + error.message });
  }
};

// ==========================================
// HÃ€M 5: Cáº¬P NHáº¬T USER (PUT /api/users/:id)
// CHá»ˆ SUPER_ADMIN Má»šI ÄÆ¯á»¢C DÃ™NG
// VALIDATION Ráº¤T CHáº¶T CHáº¼:
// - Cháº·n: email, password, created_by
// - Cho phÃ©p: full_name, phone, role, is_active, assigned_buildings
// - Prevent self-deactivate & self-role-reduction
// - Log ADMIN_UPDATE_USER (thay UPDATE_USER)
// ==========================================
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { full_name, phone, role, is_active, assigned_buildings, organization_id } = req.body;

    // Block update email/password/created_by
    if (req.body.email !== undefined || req.body.password !== undefined || req.body.created_by !== undefined) {
      return res.status(400).json({
        message: 'Không thể cập nhật email, password, hoặc created_by thông qua API này.'
      });
    }

    // Lấy thông tin cũ sớm — cần cho validation sau
    const oldUser = await User.findById(userId).select('full_name phone role is_active assigned_buildings organization_id').lean();
    if (!oldUser) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản để cập nhật!' });
    }

    const allowed = await assertUserInOrgScope(req, res, oldUser);
    if (!allowed) return;

    if (req.user.role === 'ORG_ADMIN') {
      if (role !== undefined && role !== 'BUILDING_ADMIN') {
        return res.status(403).json({ message: 'Org Admin chỉ được gán role BUILDING_ADMIN.' });
      }
      if (organization_id !== undefined) {
        return res.status(403).json({ message: 'Org Admin không được thay đổi organization của user.' });
      }
    }

    const updateData = {};

    if (full_name !== undefined) {
      const nameErrors = validateFullName(full_name);
      if (nameErrors.length) {
        return res.status(400).json({ message: 'Họ tên không hợp lệ.', errors: nameErrors });
      }
      updateData.full_name = normalizeFullName(full_name);
    }
    if (phone !== undefined) {
      if (typeof phone !== 'string') {
        return res.status(400).json({ message: 'Số điện thoại phải là chuỗi.' });
      }
      if (phone && !/^[0-9\+\-\s]{1,20}$/.test(phone)) {
        return res.status(400).json({ message: 'Số điện thoại không hợp lệ. Chỉ chấp nhận số, dấu +, - và khoảng trắng (tối đa 20 ký tự).' });
      }
      updateData.phone = phone;
    }
    if (role !== undefined) {
      updateData.role = role;
    }
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ message: 'is_active phải là boolean (true/false).' });
      }
      updateData.is_active = is_active;
    }

    // NEW: Validate organization_id nếu được set
    if (organization_id !== undefined) {
      const targetRole = role !== undefined ? role : oldUser.role;
      if (organization_id === null && targetRole === 'BUILDING_ADMIN') {
        return res.status(400).json({ message: 'BUILDING_ADMIN bắt buộc phải có organization_id.' });
      }
      if (organization_id !== null) {
        const org = await Organization.findById(organization_id);
        if (!org) {
          return res.status(400).json({ message: 'Organization không tồn tại.' });
        }
        if (!org.is_active) {
          return res.status(400).json({ message: 'Organization đã bị vô hiệu hóa.' });
        }
      }
      updateData.organization_id = organization_id;
    }

    if (assigned_buildings !== undefined) {
      if (!Array.isArray(assigned_buildings)) {
        return res.status(400).json({ message: 'assigned_buildings phải là mảng.' });
      }

      // NEW: Validate assigned_buildings — tất cả phải cùng organization với user
      // Xác định organization_id của user sau update:
      // - Nếu có organization_id trong body → dùng đó
      // - Nếu không → lấy từ oldUser.organization_id
      const userOrgId = organization_id !== undefined ? organization_id : oldUser.organization_id;

      // Chỉ validate nếu user là BUILDING_ADMIN và có organization_id (không phải SUPER_ADMIN)
      // SUPER_ADMIN có organization_id = null → có thể gán building bất kỳ
      const targetRole = role !== undefined ? role : oldUser.role;
      if (targetRole === 'BUILDING_ADMIN' && userOrgId && assigned_buildings.length > 0) {
        const buildings = await Building.find({ _id: { $in: assigned_buildings } }).select('organization_id');
        const mismatched = buildings.filter(b => String(b.organization_id) !== String(userOrgId));
        if (mismatched.length > 0) {
          return res.status(400).json({
            message: 'Một số tòa nhà không thuộc organization của user.',
            mismatched_building_ids: mismatched.map(b => b._id)
          });
        }
      }

      updateData.assigned_buildings = assigned_buildings;
    }

    const validRoles = req.user.role === 'ORG_ADMIN'
      ? ['BUILDING_ADMIN']
      : ['SUPER_ADMIN', 'ORG_ADMIN', 'BUILDING_ADMIN'];
    if (role !== undefined && !validRoles.includes(role)) {
      return res.status(400).json({
        message: `role phải là: ${validRoles.join(' hoặc ')}`
      });
    }

    // Prevent self-deactivate
    if (req.user.userId === userId && is_active === false) {
      return res.status(403).json({ message: 'Bạn không thể tự khóa tài khoản chính mình.' });
    }

    // Prevent self-role-reduction: SUPER_ADMIN → BUILDING_ADMIN
    if (req.user.userId === userId) {
      const currentUser = await User.findById(req.user.userId);
      if (currentUser && currentUser.role === 'SUPER_ADMIN' && role === 'BUILDING_ADMIN') {
        return res.status(403).json({ message: 'Super Admin không thể hạ role của chính mình xuống BUILDING_ADMIN.' });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản để cập nhật!' });
    }

    // Xác định hành động và details
    const changedFields = Object.keys(updateData);

    // 1. Kiểm tra thay đổi assigned_buildings riêng biệt
    let assignLogs = [];
    let unassignLogs = [];
    let otherChanges = {};

    if (assigned_buildings !== undefined) {
        const oldIds = (oldUser.assigned_buildings || []).map(String);
        const newIds = (assigned_buildings || []).map(String);

        const added = newIds.filter(id => !oldIds.includes(id));
        const removed = oldIds.filter(id => !newIds.includes(id));

        if (added.length > 0) {
            assignLogs.push({
                user_id: userId,
                user_email: updatedUser.email,
                added,
                timestamp: new Date()
            });
        }
        if (removed.length > 0) {
            unassignLogs.push({
                user_id: userId,
                user_email: updatedUser.email,
                removed,
                timestamp: new Date()
            });
        }

        // Loại assigned_buildings khỏi changedFields để không log trong ADMIN_UPDATE_USER
        const idx = changedFields.indexOf('assigned_buildings');
        if (idx > -1) changedFields.splice(idx, 1);
    }

    // 2. Chỉ is_active thay đổi?
    const onlyIsActiveChanged = changedFields.length === 1 && changedFields.includes('is_active') && oldUser.is_active !== updateData.is_active;

    if (onlyIsActiveChanged) {
        const action = updateData.is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER';
        logActivity({
            user_id: req.user.userId,
            action,
            target_type: 'user',
            target_id: userId,
            target: updatedUser.email,
            details: { from: oldUser.is_active, to: updateData.is_active },
            ip_address: getClientIp(req)
        });
    } else if (changedFields.length > 0) {
        // Các thay đổi khác (role, phone, full_name, etc.)
        const changes = {};
        changedFields.forEach(field => {
            const oldVal = oldUser[field];
            const newVal = updateData[field];
            if (oldVal !== newVal) {
                changes[field] = { from: oldVal, to: newVal };
            }
        });
        logActivity({
            user_id: req.user.userId,
            action: 'ADMIN_UPDATE_USER',
            target_type: 'user',
            target_id: userId,
            target: updatedUser.email,
            details: changes,
            ip_address: getClientIp(req)
        });
    }

    // 3. Log BUILDING_ASSIGN và BUILDING_UNASSIGN riêng (fire-and-forget)
    if (assignLogs.length > 0) {
        assignLogs.forEach(entry => {
            logActivity({
                user_id: req.user.userId,
                action: 'BUILDING_ASSIGN',
                target_type: 'user',
                target_id: entry.user_id,
                target: entry.user_email,
                details: { building_ids: entry.added },
                ip_address: getClientIp(req)
            }).catch(err => console.error('Failed to log BUILDING_ASSIGN:', err));
        });
    }

    if (unassignLogs.length > 0) {
        unassignLogs.forEach(entry => {
            logActivity({
                user_id: req.user.userId,
                action: 'BUILDING_UNASSIGN',
                target_type: 'user',
                target_id: entry.user_id,
                target: entry.user_email,
                details: { building_ids: entry.removed },
                ip_address: getClientIp(req)
            }).catch(err => console.error('Failed to log BUILDING_UNASSIGN:', err));
        });
    }

    res.status(200).json({
      message: 'Cập nhật tài khoản thành công!',
      user: updatedUser
    });

  } catch (error) {
    console.error('UpdateUser error:', error);
    res.status(500).json({ message: 'Lỗi cập nhật tài khoản: ' + error.message });
  }
};
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản để xóa!' });
    }

    // Prevent self-deactivate
    if (req.user.userId === userId) {
      return res.status(403).json({ message: 'Bạn không thể xóa chính mình.' });
    }

    const oldIsActive = user.is_active;
    const updateData = { is_active: false };
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password');

    // Log DEACTIVATE_USER với chi tiết
    logActivity({
      user_id: req.user.userId,
      action: 'DEACTIVATE_USER',
      target_type: 'user',
      target_id: userId,
      target: updatedUser.email,
      details: { from: oldIsActive, to: false },
      ip_address: getClientIp(req)
    });

    res.status(200).json({
      message: 'Đã khóa tài khoản (is_active = false).',
      user: updatedUser
    });

  } catch (error) {
    console.error('DeleteUser error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
};

// PUT /api/users/:userId/reset-password — Super Admin / Org Admin đặt lại mật khẩu user
const adminResetPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword, generate } = req.body || {};

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Không thể đặt lại mật khẩu Super Admin qua API này.' });
    }

    const allowed = await assertUserInOrgScope(req, res, user);
    if (!allowed) return;

    if (req.user.role === 'ORG_ADMIN' && user.role === 'ORG_ADMIN') {
      return res.status(403).json({ message: 'Org Admin không thể đặt lại mật khẩu Org Admin khác.' });
    }

    let plain = typeof newPassword === 'string' ? newPassword.trim() : '';
    const wasGenerated = !!generate;
    if (wasGenerated) {
      plain = crypto.randomBytes(9).toString('base64url').slice(0, 12);
    }
    if (!plain || plain.length < 8) {
      return res.status(400).json({
        message: 'Mật khẩu mới phải có ít nhất 8 ký tự (hoặc gửi generate: true để tạo ngẫu nhiên).'
      });
    }

    user.password = await bcrypt.hash(plain, 10);
    await user.save();

    logActivity({
      user_id: req.user.userId,
      action: 'ADMIN_RESET_PASSWORD',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      details: {
        message: 'Admin đặt lại mật khẩu',
        generated: wasGenerated
      },
      ip_address: getClientIp(req),
      organization_id: user.organization_id || null
    });

    res.status(200).json({
      message: 'Đặt lại mật khẩu thành công.',
      temporary_password: plain
    });
  } catch (error) {
    console.error('AdminResetPassword error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
};

module.exports = {
  getUsers: listUsers, // TÃªn cÅ©
  listUsers, // TÃªn má»›i
  getUserById,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
  changePassword,
  adminResetPassword
};





