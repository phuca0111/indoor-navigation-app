const mongoose = require('mongoose');

/**
 * Chạy một use case trong MongoDB transaction.
 *
 * Quy ước:
 * - Application Service sở hữu transaction.
 * - Repository nhận session qua tham số, không tự mở transaction.
 * - Khi caller truyền session, caller tiếp tục sở hữu commit/rollback/endSession.
 */
async function withMongoUnitOfWork(work, options = {}) {
  if (typeof work !== 'function') {
    throw new TypeError('Unit of Work yêu cầu callback là một hàm.');
  }

  if (options.session) {
    return work(options.session);
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    }, options.transactionOptions);
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { withMongoUnitOfWork };
