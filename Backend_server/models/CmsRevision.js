const mongoose = require('mongoose');

const cmsRevisionSchema = new mongoose.Schema({
  resource_type: {
    type: String,
    enum: ['ARTICLE', 'BANNER', 'MEDIA', 'PAGE', 'CONFIG'],
    required: true,
    immutable: true,
    index: true
  },
  resource_id: { type: String, required: true, immutable: true, index: true },
  revision: { type: Number, required: true, min: 1, immutable: true },
  action: { type: String, required: true, immutable: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  actor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  },
  correlation_id: { type: String, default: '', immutable: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: false }, minimize: false });

cmsRevisionSchema.index(
  { resource_type: 1, resource_id: 1, revision: 1 },
  { unique: true }
);

for (const hook of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne']) {
  cmsRevisionSchema.pre(hook, function rejectMutation() {
    throw Object.assign(new Error('CmsRevision là bất biến.'), {
      code: 'CMS_REVISION_IMMUTABLE'
    });
  });
}

module.exports = mongoose.model('CmsRevision', cmsRevisionSchema);
