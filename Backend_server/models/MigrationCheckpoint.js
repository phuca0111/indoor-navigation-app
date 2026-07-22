const mongoose = require('mongoose');

const migrationCheckpointSchema = new mongoose.Schema({
  migration_key: { type: String, required: true, unique: true },
  last_id: { type: String, default: '' },
  processed: { type: Number, default: 0 },
  changed: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  metadata: { type: Object, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('MigrationCheckpoint', migrationCheckpointSchema);
