const Receipt = require('../models/Receipt');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function findByInvoice(invoiceId, { session } = {}) {
  const query = Receipt.findOne({ invoice_id: invoiceId }).lean();
  return session ? query.session(session) : query;
}

async function createReceipt(input, { session } = {}) {
  const [created] = await Receipt.create([input], session ? { session } : undefined);
  return toDto(created);
}

module.exports = {
  findByInvoice,
  createReceipt
};
