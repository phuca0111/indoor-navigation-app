const BankUser = require('../models/BankUser');
const BankWallet = require('../models/BankWallet');
const BankTransaction = require('../models/BankTransaction');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function ensureUserIndexes() {
  return BankUser.ensureBankUserIndexes();
}

async function findUserByIdentity({ email, phone }, { session } = {}) {
  const filter = email ? { email } : { phone };
  const query = BankUser.findOne(filter).lean();
  return session ? query.session(session) : query;
}

async function findUserById(userId, { session } = {}) {
  const query = BankUser.findById(userId).lean();
  return session ? query.session(session) : query;
}

async function createUser(input, { session } = {}) {
  const [created] = await BankUser.create(
    [input],
    session ? { session } : undefined
  );
  return toDto(created);
}

async function ensureWallet(bankUserId, { session } = {}) {
  return BankWallet.findOneAndUpdate(
    { bank_user_id: bankUserId },
    { $setOnInsert: { bank_user_id: bankUserId, balance: 0 } },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
      ...(session ? { session } : {})
    }
  ).lean();
}

async function findWallet(bankUserId, { session } = {}) {
  const query = BankWallet.findOne({ bank_user_id: bankUserId }).lean();
  return session ? query.session(session) : query;
}

async function debitWallet(bankUserId, amount, { session } = {}) {
  return BankWallet.findOneAndUpdate(
    { bank_user_id: bankUserId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function creditWalletById(walletId, amount, { session } = {}) {
  return BankWallet.findByIdAndUpdate(
    walletId,
    { $inc: { balance: amount } },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function creditWallet(bankUserId, amount, { session } = {}) {
  return BankWallet.findOneAndUpdate(
    { bank_user_id: bankUserId },
    { $inc: { balance: amount } },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function findTransactionByIdempotency(idempotencyKey, { session } = {}) {
  if (!idempotencyKey) return null;
  const query = BankTransaction.findOne({ idempotency_key: idempotencyKey }).lean();
  return session ? query.session(session) : query;
}

async function createTransaction(input, { session } = {}) {
  const [created] = await BankTransaction.create(
    [input],
    session ? { session } : undefined
  );
  return toDto(created);
}

async function findLatestPaymentForInvoice(invoiceId, { session } = {}) {
  const query = BankTransaction.findOne({
    type: 'PAYMENT',
    invoice_id: invoiceId
  })
    .sort({ createdAt: -1 })
    .lean();
  return session ? query.session(session) : query;
}

async function listTransactions(bankUserId, limit = 20) {
  return BankTransaction.find({ bank_user_id: bankUserId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 20, 100))
    .lean();
}

module.exports = {
  ensureUserIndexes,
  findUserByIdentity,
  findUserById,
  createUser,
  ensureWallet,
  findWallet,
  debitWallet,
  creditWalletById,
  creditWallet,
  findTransactionByIdempotency,
  createTransaction,
  findLatestPaymentForInvoice,
  listTransactions
};
