const mongoose = require('mongoose');

const reconciliationRunSchema = new mongoose.Schema({
  provider: { type: String, required: true, uppercase: true, trim: true, index: true },
  from: { type: Date, required: true },
  to: { type: Date, required: true },
  status: { type: String, enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'], default: 'PENDING', index: true },
  summary: { type: Object, default: {} },
  started_at: { type: Date, default: null },
  completed_at: { type: Date, default: null },
  error: { type: String, default: '' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('ReconciliationRun', reconciliationRunSchema);
