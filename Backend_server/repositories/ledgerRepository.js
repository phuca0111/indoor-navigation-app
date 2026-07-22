const LedgerTransaction = require('../models/LedgerTransaction');
const LedgerEntry = require('../models/LedgerEntry');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function createLedgerRepository(deps = {}) {
  const Transaction = deps.LedgerTransaction || LedgerTransaction;
  const Entry = deps.LedgerEntry || LedgerEntry;

  return {
    async findByPostingKey(postingKey, { session } = {}) {
      const query = Transaction.findOne({ posting_key: postingKey });
      if (session && typeof query.session === 'function') query.session(session);
      return toDto(await query);
    },

    async createTransaction(input, { session } = {}) {
      const created = session
        ? await Transaction.create([input], { session })
        : await Transaction.create(input);
      const row = Array.isArray(created) ? created[0] : created;
      return toDto(row);
    },

    async insertEntries(entries, { session } = {}) {
      const created = await Entry.insertMany(entries, session ? { session } : undefined);
      return created.map(toDto);
    },

    async deleteTransaction(transactionId, { session } = {}) {
      return Transaction.deleteOne(
        { _id: transactionId },
        session ? { session } : undefined
      );
    }
  };
}

async function signedAccountTotal(accountCode, start, end) {
  const rows = await LedgerEntry.aggregate([
    {
      $match: {
        account_code: accountCode,
        occurred_at: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        amount_minor: {
          $sum: {
            $cond: [
              { $eq: ['$side', 'CREDIT'] },
              '$amount_minor',
              { $multiply: ['$amount_minor', -1] }
            ]
          }
        },
        count: { $sum: 1 }
      }
    }
  ]);
  return {
    amount: Number(rows[0]?.amount_minor) || 0,
    count: Number(rows[0]?.count) || 0
  };
}

module.exports = {
  createLedgerRepository,
  signedAccountTotal
};
