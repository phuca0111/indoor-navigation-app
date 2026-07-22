// ============================================
// FILE: Draft.js
// MỤC ĐÍCH: Schema cho bản nháp tầng (collection 'drafts')
// Replace source-of-truth draft riêng, không nằm trong Floor
// ============================================

const mongoose = require('mongoose');

const draftSchema = new mongoose.Schema({
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true
  },
  floor_number: {
    type: Number,
    required: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
    // rooms, walls, pois, nodes, edges, qr_anchors, lines, blocks, blockInserts, ...
  },
  version: {
    type: Number,
    default: 1 // Revision optimistic concurrency, tăng mỗi lần save
  },
  payload_fingerprint: {
    type: String,
    default: '',
    index: true
  },
  deleted_at: {
    type: Date,
    default: null,
    index: true
  },
  purge_after: {
    type: Date,
    default: null
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'drafts'
});

// Một building + floor = một draft
draftSchema.index({ building_id: 1, floor_number: 1 }, { unique: true });
// Mongo tự dọn sau retention; service GC vẫn tồn tại để audit/provider scheduling.
draftSchema.index({ purge_after: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Draft', draftSchema);
