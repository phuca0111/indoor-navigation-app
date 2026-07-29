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
    required: false,
    default: null
  },

  // Cột 2: Hành động gì (enum đầy đủ)
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN', 'LOGOUT', 'REGISTER', 'UPDATE_PROFILE', 'CHANGE_PASSWORD',
      'PUBLISH_MAP', 'PUBLISH_MAP_REQUESTED', 'LOAD_MAP', 'ROLLBACK_MAP', 'MAP_VERSION_RETENTION',
      'CREATE_BUILDING', 'UPDATE_BUILDING', 'DELETE_BUILDING', 'DEACTIVATE_BUILDING', 'ACTIVATE_BUILDING',
      'ADD_FLOOR', 'REMOVE_FLOOR', 'RENAME_FLOOR', 'DUPLICATE_FLOOR',
      'SET_FLOOR_VISIBILITY', 'REORDER_FLOORS',
      'CREATE_USER', 'ADMIN_UPDATE_USER', 'ACTIVATE_USER', 'DEACTIVATE_USER', 'DELETE_USER',
      'WARN_USER', 'BAN_USER', 'UNBAN_USER',
      'EMERGENCY_CONSENT_UPDATE', 'DEVICE_REGISTER', 'DEVICE_REVOKE',
      'INCIDENT_CREATE', 'INCIDENT_UPDATE', 'INCIDENT_STATUS_CHANGE',
      'HAZARD_ZONE_CREATE', 'HAZARD_ZONE_UPDATE', 'HAZARD_ZONE_ACTIVATE', 'HAZARD_ZONE_DEACTIVATE',
      'EMERGENCY_BROADCAST_SEND', 'EMERGENCY_LOCATION_REPORT', 'EMERGENCY_POSSIBLY_TRAPPED',
      'SEISMIC_EARTHQUAKE_TRIGGER', 'USGS_EARTHQUAKE_TRIGGER',
      'ASSIGN_BUILDING', 'BUILDING_ASSIGN', 'BUILDING_UNASSIGN',
      'BUILDING_ACCESS_DENIED',
      'CREATE_QR', 'DELETE_QR',
      'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_COMPLETE',
      'LOGOUT_ALL', 'SESSION_REVOKED', 'EMAIL_VERIFIED',
      'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED',
      'CREATE_ORG', 'APPROVE_ORG_REGISTRATION', 'REJECT_ORG_REGISTRATION',
      'UPDATE_ORGANIZATION', 'DEACTIVATE_ORGANIZATION', 'ACTIVATE_ORGANIZATION',
      'ADMIN_RESET_PASSWORD',
      'SELF_SERVICE_ORG_TRIAL', 'UNLOCK_SESSION',
      // Billing / gói / thanh toán
      'CREATE_PLAN', 'UPDATE_PLAN', 'DELETE_PLAN',
      'CREATE_INVOICE', 'UPDATE_INVOICE', 'VOID_INVOICE', 'MARK_INVOICE_PAID',
      'CHECKOUT_START', 'SUBSCRIPTION_PAYMENT', 'REFUND_PAYMENT',
      'PERSONAL_PLAN_UPGRADE', 'SAVE_DRAFT',
      'ACTIVATE_SUBSCRIPTION', 'CANCEL_SUBSCRIPTION', 'EXPIRE_SUBSCRIPTION',
      'CREATE_BILLING_EVENT', 'UPDATE_ORG_CONTACT',
      'SET_PUBLISH_PERMIT', 'CLEAR_PUBLISH_PERMIT',
      'MEMBER_INVITED', 'MEMBER_INVITE_REVOKED', 'MEMBER_INVITE_ACCEPTED',
      'MEMBER_UPDATED', 'MEMBER_REMOVED',
      'MAP_REVIEW_AUTO_APPROVE', 'MAP_REVIEW_SUBMIT', 'MAP_REVIEW_APPROVE',
      'MAP_REVIEW_REJECT', 'MAP_REVIEW_MERGE_STUB', 'MAP_REVIEW_MERGE_ENGINE', 'MAP_MODERATION_RESOLVE',
      'PLACE_OWNERSHIP_SUBMIT', 'PLACE_OWNERSHIP_APPROVE', 'PLACE_OWNERSHIP_REJECT', 'PLACE_SET_OWNER',
      'PLACE_MERGE_EXECUTE', 'PLACE_MERGE_APPROVE', 'CREATE_PLACE',
      'UPDATE_PLACE', 'DELETE_PLACE', 'LOCK_PLACE', 'ATTACH_BUILDING_PLACE', 'DETACH_BUILDING_PLACE',
      'UPDATE_BUILDING_VISIBILITY', 'JOIN_ORG_REQUEST', 'JOIN_ORG_APPROVE',
      'JOIN_ORG_REJECT',
      'PLACE_REVIEW_DEACTIVATE', 'PLACE_REVIEW_ACTIVATE', 'PLACE_FAVORITE_REMOVE',
      'MAP_CONTRIBUTION_CREATE', 'MAP_CONTRIBUTION_APPROVE', 'MAP_CONTRIBUTION_REJECT',
      'UNLOCK_PLACE',
      'PLACE_PROPOSAL_CREATE', 'PLACE_PROPOSAL_APPROVE', 'PLACE_PROPOSAL_REJECT',
      'PLACE_VERIFICATION_REQUEST', 'PLACE_VERIFICATION_APPROVE', 'PLACE_VERIFICATION_REJECT',
      'INDOOR_WORKSPACE_CREATE'
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

activityLogSchema.index({ organization_id: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.post('save', function dualWriteAudit(doc) {
  if (doc.$locals?.skipAuditDualWrite) return;
  const { dualWriteActivity } = require('../services/auditService');
  dualWriteActivity(doc).catch((error) => {
    console.warn('[Audit dual-write]', error.message);
  });
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);
