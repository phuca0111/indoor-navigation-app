// ============================================
// FILE: ActivityLog.js
// MỤC ĐÍCH: Tạo khuôn mẫu (Schema) cho bảng Nhật Ký Hoạt Động
// BẢNG NÀY LƯU: Ai đã làm gì, lúc mấy giờ, ở đâu
// DÙNG ĐỂ: Truy vết lịch sử, biết ai xóa nhầm dữ liệu
// ============================================

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({

  // Cột 1: Ai đã thực hiện hành động (Liên kết sang bảng User)
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Cột 2: Hành động gì (enum đầy đủ)
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN', 'LOGOUT', 'REGISTER', 'UPDATE_PROFILE', 'CHANGE_PASSWORD',
      'PUBLISH_MAP', 'LOAD_MAP', 'ROLLBACK_MAP', 'MAP_VERSION_RETENTION',
      'CREATE_BUILDING', 'UPDATE_BUILDING', 'DELETE_BUILDING', 'DEACTIVATE_BUILDING', 'ACTIVATE_BUILDING',
      'ADD_FLOOR', 'REMOVE_FLOOR',
      'CREATE_USER', 'ADMIN_UPDATE_USER', 'ACTIVATE_USER', 'DEACTIVATE_USER', 'DELETE_USER',
      'ASSIGN_BUILDING', 'BUILDING_ASSIGN', 'BUILDING_UNASSIGN',
      'BUILDING_ACCESS_DENIED',
      'CREATE_QR', 'DELETE_QR',
      'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_COMPLETE',
      'LOGOUT_ALL',
      'CREATE_ORG', 'APPROVE_ORG_REGISTRATION', 'REJECT_ORG_REGISTRATION',
      'UPDATE_ORGANIZATION', 'DEACTIVATE_ORGANIZATION', 'ACTIVATE_ORGANIZATION',
      'ADMIN_RESET_PASSWORD',
      'SELF_SERVICE_ORG_TRIAL', 'UNLOCK_SESSION'
    ]
  },

  // Cột 3: Loại đối tượng bị tác động — 'building' | 'floor' | 'user' | 'qr'
  target_type: {
    type: String,
    default: ''
  },

  // Cột 4: ID của đối tượng bị tác động (dạng String để linh hoạt với ObjectId)
  target_id: {
    type: String,
    default: ''
  },

  // Cột 5: Mô tả dạng text — VD: "Bệnh viện Chợ Rẫy - Tầng 3"
  target: {
    type: String,
    default: ''
  },

  // Cột 6: Ghi chú chi tiết thêm
  details: {
    type: Object,
    default: {}
  },

  // Cột 7: Địa chỉ IP của máy thực hiện
  ip_address: {
    type: String,
    default: ''
  },

  // Cột 8: Organization mà hoạt động thuộc về (tenant context)
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  }

}, {
  // Tự động thêm 2 cột: createdAt (ngày tạo) và updatedAt (ngày cập nhật)
  timestamps: true
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);
