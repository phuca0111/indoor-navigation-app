// Place Platform — end-user report (sai vị trí / tên / spam / duplicate / closed)
const mongoose = require('mongoose');
const {
  PLACE_REPORT_REASON_VALUES,
  PLACE_REPORT_STATUS_VALUES,
  PLACE_REPORT_REASON,
  PLACE_REPORT_STATUS
} = require('../utils/placePlatform');

const placeReportSchema = new mongoose.Schema({
  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    required: true,
    index: true
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

placeReportSchema.index({ reported_by: 1, createdAt: -1 });
placeReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PlaceReport', placeReportSchema);
