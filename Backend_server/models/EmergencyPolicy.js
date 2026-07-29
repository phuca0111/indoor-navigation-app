/**
 * Phase 3 — Emergency Policy (rule JSON theo hazard_type).
 */
const mongoose = require('mongoose');
const { HAZARD_TYPES } = require('./HazardZone');

const emergencyPolicySchema = new mongoose.Schema({
  hazard_type: {
    type: String,
    enum: HAZARD_TYPES,
    required: true,
    unique: true
  },
  rules: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  version: { type: Number, default: 1 },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('EmergencyPolicy', emergencyPolicySchema);
