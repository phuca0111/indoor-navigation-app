// ============================================
// FILE: FloorEditLock.js
// Phase 8 — Soft lock tầng khi edit (Mongo-backed, không Redis)
// ============================================

const mongoose = require('mongoose');

const floorEditLockSchema = new mongoose.Schema({
    building_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Building',
        required: true
    },
    floor_number: {
        type: Number,
        required: true
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    user_email: {
        type: String,
        default: ''
    },
    session_id: {
        type: String,
        required: true
    },
    expires_at: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

floorEditLockSchema.index({ building_id: 1, floor_number: 1 }, { unique: true });
floorEditLockSchema.index({ expires_at: 1 });

module.exports = mongoose.model('FloorEditLock', floorEditLockSchema);
