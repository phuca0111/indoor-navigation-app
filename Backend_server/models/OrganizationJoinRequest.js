// ============================================
// FILE: OrganizationJoinRequest.js
// MỤC ĐÍCH: Yêu cầu tham gia tổ chức của REGISTERED_USER.
// ORG_ADMIN duyệt → user trở thành BUILDING_ADMIN thuộc tổ chức.
// ============================================

const mongoose = require('mongoose');

const joinRequestSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    organization_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
        default: 'PENDING'
    },
    message: {
        type: String,
        default: ''
    },
    decided_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    decided_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Mỗi user chỉ có tối đa 1 yêu cầu PENDING cho mỗi tổ chức
joinRequestSchema.index(
    { user_id: 1, organization_id: 1 },
    { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

module.exports = mongoose.model('OrganizationJoinRequest', joinRequestSchema);
