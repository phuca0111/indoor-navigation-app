const mongoose = require('mongoose');

const searchProjectionSchema = new mongoose.Schema({
  projection_key: { type: String, required: true, unique: true, immutable: true },
  type: { type: String, required: true, index: true },
  source_id: { type: String, required: true, index: true },
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null,
    index: true
  },
  visibility: {
    type: String,
    enum: ['PUBLIC', 'TENANT', 'PLATFORM'],
    default: 'TENANT',
    index: true
  },
  label: { type: String, required: true },
  detail: { type: String, default: '' },
  search_text: { type: String, required: true, index: true },
  route: { type: mongoose.Schema.Types.Mixed, default: {} },
  source_version: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false, index: true },
  indexed_at: { type: Date, default: Date.now }
}, { timestamps: true });

searchProjectionSchema.index({
  type: 1,
  organization_id: 1,
  building_id: 1,
  deleted: 1
});

module.exports = mongoose.model('SearchProjection', searchProjectionSchema);
