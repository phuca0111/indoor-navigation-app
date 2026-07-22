const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

departmentSchema.index({ organization_id: 1, code: 1 }, { unique: true });
departmentSchema.index({ organization_id: 1, name: 1 });

module.exports = mongoose.model('Department', departmentSchema);
