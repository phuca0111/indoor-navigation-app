/**
 * Phase 3 — Emergency Broadcast record (trạng thái gửi theo incident).
 */
const mongoose = require('mongoose');

const emergencyBroadcastSchema = new mongoose.Schema({
  incident_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SENT', 'FAILED', 'PARTIAL'],
    default: 'PENDING'
  },
  title: { type: String, default: '' },
  body: { type: String, default: '' },
  recipient_count: { type: Number, default: 0 },
  push_sent_count: { type: Number, default: 0 },
  in_app_count: { type: Number, default: 0 },
  /** FCM proximity_check (không phải người nhận Spec D trong khu vực). */
  proximity_wake_count: { type: Number, default: 0 },
  notification_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Notification' }],
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  sent_at: { type: Date, default: null },
  error: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('EmergencyBroadcast', emergencyBroadcastSchema);
