// User activity history — My Maps Phase 1
const mongoose = require('mongoose');

const HISTORY_TYPES = ['VIEW_PLACE', 'VIEW_INDOOR', 'SEARCH', 'OPEN_WORKSPACE', 'OTHER'];

const userHistorySchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: HISTORY_TYPES,
    default: 'OTHER',
    index: true
  },
  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    default: null,
    index: true
  },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null
  },
  workspace_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IndoorWorkspace',
    default: null
  },
  label: {
    type: String,
    default: '',
    maxlength: 300
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

userHistorySchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('UserHistory', userHistorySchema);
module.exports.HISTORY_TYPES = HISTORY_TYPES;
