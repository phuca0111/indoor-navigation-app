const mongoose = require('mongoose');

const MEMBER_ROLES = ['ORG_ADMIN', 'BUILDING_ADMIN'];

const organizationMemberSchema = new mongoose.Schema({
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: MEMBER_ROLES, required: true },
  department_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  building_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Building' }],
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'LEFT'], default: 'ACTIVE', index: true },
  joined_at: { type: Date, default: Date.now },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

organizationMemberSchema.index({ organization_id: 1, user_id: 1 }, { unique: true });
organizationMemberSchema.index({ organization_id: 1, department_id: 1, status: 1 });

module.exports = mongoose.model('OrganizationMember', organizationMemberSchema);
module.exports.MEMBER_ROLES = MEMBER_ROLES;
