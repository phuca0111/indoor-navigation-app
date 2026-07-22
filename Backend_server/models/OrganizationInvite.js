// B5 — Lời mời thành viên tổ chức (ORG_ADMIN mời → user accept bằng token)
const mongoose = require('mongoose');

const INVITE_ROLES = ['BUILDING_ADMIN', 'ORG_ADMIN'];

const organizationInviteSchema = new mongoose.Schema({
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  role: {
    type: String,
    enum: INVITE_ROLES,
    default: 'BUILDING_ADMIN'
  },
  token_hash: {
    type: String,
    required: true,
    select: false
  },
  expires_at: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'],
    default: 'PENDING',
    index: true
  },
  invited_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  accepted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  accepted_at: {
    type: Date,
    default: null
  },
  note: {
    type: String,
    default: '',
    trim: true
  }
}, { timestamps: true });

organizationInviteSchema.index(
  { organization_id: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

organizationInviteSchema.index(
  { token_hash: 1 },
  { unique: true, partialFilterExpression: { token_hash: { $type: 'string' } } }
);

module.exports = mongoose.model('OrganizationInvite', organizationInviteSchema);
module.exports.INVITE_ROLES = INVITE_ROLES;
