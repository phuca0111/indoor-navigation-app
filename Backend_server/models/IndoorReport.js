// Engagement trong nhà — báo cáo phòng / POI
const mongoose = require('mongoose');
const {
  PLACE_REPORT_REASON_VALUES,
  PLACE_REPORT_STATUS_VALUES,
  PLACE_REPORT_REASON,
  PLACE_REPORT_STATUS
} = require('../utils/placePlatform');

const ENTITY_KINDS = ['ROOM', 'POI'];

const indoorReportSchema = new mongoose.Schema({
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true
  },
  floor_number: {
    type: Number,
    required: true,
    index: true
  },
  entity_kind: {
    type: String,
    enum: ENTITY_KINDS,
    required: true,
    index: true
  },
  entity_id: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64,
    index: true
  },
  /** Snapshot tên lúc báo cáo (map có thể đổi sau) */
  entity_name: {
    type: String,
    default: '',
    maxlength: 200
  },
  reason_code: {
    type: String,
    enum: PLACE_REPORT_REASON_VALUES,
    default: PLACE_REPORT_REASON.OTHER,
    index: true
  },
  detail: {
    type: String,
    default: '',
    maxlength: 2000
  },
  status: {
    type: String,
    enum: PLACE_REPORT_STATUS_VALUES,
    default: PLACE_REPORT_STATUS.OPEN,
    index: true
  },
  reported_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  resolved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolved_at: {
    type: Date,
    default: null
  },
  resolver_note: {
    type: String,
    default: '',
    maxlength: 1000
  }
}, { timestamps: true });

indoorReportSchema.index({ status: 1, createdAt: -1 });
indoorReportSchema.index({ reported_by: 1, createdAt: -1 });

module.exports = mongoose.model('IndoorReport', indoorReportSchema);
module.exports.ENTITY_KINDS = ENTITY_KINDS;
