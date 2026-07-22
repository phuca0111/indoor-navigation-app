const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, unique: true, immutable: true },
  receipt_number: { type: String, required: true, unique: true, immutable: true },
  captured_at: { type: Date, required: true, immutable: true },
  currency: { type: String, required: true, immutable: true },
  total_minor: { type: Number, required: true, immutable: true },
  snapshot: { type: Object, required: true, immutable: true }
}, { timestamps: true });

receiptSchema.pre('save', function immutableAfterCreate() {
  if (!this.isNew && this.isModified()) {
    throw Object.assign(new Error('Receipt là bất biến sau capture.'), { code: 'RECEIPT_IMMUTABLE' });
  }
});

for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne']) {
  receiptSchema.pre(operation, function rejectReceiptMutation() {
    throw Object.assign(new Error('Receipt là bất biến sau capture.'), { code: 'RECEIPT_IMMUTABLE' });
  });
}

module.exports = mongoose.model('Receipt', receiptSchema);
