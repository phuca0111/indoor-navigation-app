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
    default: 1 // Tăng mỗi lần save
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

module.exports = mongoose.model('Draft', draftSchema);
