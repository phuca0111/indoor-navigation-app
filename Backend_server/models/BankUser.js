// Phase 5.8 — Người dùng app TPTPbank (tách khỏi User SaaS)
const mongoose = require('mongoose');

const bankUserSchema = new mongoose.Schema({
  email: {
    type: String,
    trim: true,
    lowercase: true
    // Không default null — thiếu field thì partial unique index bỏ qua
  },
  phone: {
    type: String,
    trim: true
  },
  password: { type: String, required: true },
  full_name: { type: String, default: '' },
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

// Unique chỉ khi có chuỗi thật (tránh E11000 khi nhiều user không nhập phone)
bankUserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } }
);
bankUserSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string', $gt: '' } } }
);

let indexesReady = null;

/**
 * Dọn phone/email null + drop index sparse cũ, sync partial unique mới.
 */
async function ensureBankUserIndexes() {
  if (indexesReady) return indexesReady;
  indexesReady = (async () => {
    const col = mongoose.connection.collection('bankusers');
    try {
      await col.updateMany(
        { $or: [{ phone: null }, { phone: '' }] },
        { $unset: { phone: '' } }
      );
      await col.updateMany(
        { $or: [{ email: null }, { email: '' }] },
        { $unset: { email: '' } }
      );

      const existing = await col.indexes();
      for (const idx of existing) {
        if (idx.name !== 'email_1' && idx.name !== 'phone_1') continue;
        const field = idx.name === 'email_1' ? 'email' : 'phone';
        const pf = idx.partialFilterExpression && idx.partialFilterExpression[field];
        const isGoodPartial = pf && pf.$type === 'string' && pf.$gt === '';
        // Index sparse cũ (index cả null) hoặc partial sai → drop
        if (!isGoodPartial) {
          await col.dropIndex(idx.name);
        }
      }
    } catch (e) {
      if (e.code !== 26 && e.codeName !== 'NamespaceNotFound') {
        console.warn('[BankUser] ensureBankUserIndexes cleanup:', e.message);
      }
    }
    await mongoose.model('BankUser').syncIndexes();
    return true;
  })().catch((e) => {
    indexesReady = null;
    throw e;
  });
  return indexesReady;
}

const BankUser = mongoose.model('BankUser', bankUserSchema);
BankUser.ensureBankUserIndexes = ensureBankUserIndexes;

module.exports = BankUser;
