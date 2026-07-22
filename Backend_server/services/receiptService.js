const crypto = require('crypto');
const receiptRepository = require('../repositories/receiptRepository');
const invoiceRepository = require('../repositories/invoiceRepository');

function cleanSnapshot(value) {
  if (!value || typeof value !== 'object') return {};
  return JSON.parse(JSON.stringify(value));
}

function buildReceiptSnapshot(invoice, context = {}) {
  const amount = Number(invoice.amount) || 0;
  const tax = Number(invoice.tax_amount) || 0;
  const discount = Number(invoice.discount_amount) || 0;
  return {
    invoice_number: invoice.invoice_number,
    currency: invoice.currency || 'VND',
    subtotal: amount,
    discount,
    tax,
    total: Math.max(0, amount - discount + tax),
    line_items: cleanSnapshot(invoice.line_items_snapshot?.length
      ? invoice.line_items_snapshot
      : [{ code: invoice.plan || 'SERVICE', description: invoice.note || `Gói ${invoice.plan || ''}`, quantity: 1, unit_amount: amount }]),
    tax: cleanSnapshot(invoice.tax_snapshot),
    customer: cleanSnapshot(invoice.customer_snapshot),
    seller: cleanSnapshot(invoice.seller_snapshot),
    provider: String(context.provider || 'MANUAL').toUpperCase(),
    provider_ref: context.externalRef || invoice.external_ref || ''
  };
}

async function captureReceipt(invoice, context = {}) {
  let receipt = await receiptRepository.findByInvoice(invoice._id, {
    session: context.session
  });
  if (receipt) {
    if (!invoice.captured_at || !invoice.receipt_number) {
      invoice = await invoiceRepository.updateInvoice(invoice._id, {
        captured_at: receipt.captured_at,
        receipt_number: receipt.receipt_number,
        receipt_snapshot: receipt.snapshot
      }, { session: context.session });
    }
    return invoice;
  }
  const capturedAt = invoice.paid_at || new Date();
  const suffix = crypto.createHash('sha256').update(String(invoice._id)).digest('hex').slice(0, 10).toUpperCase();
  const receiptNumber = `RCT-${capturedAt.getUTCFullYear()}-${suffix}`;
  const snapshot = buildReceiptSnapshot(invoice, context);
  try {
    receipt = await receiptRepository.createReceipt({
      invoice_id: invoice._id,
      receipt_number: receiptNumber,
      captured_at: capturedAt,
      currency: snapshot.currency,
      total_minor: snapshot.total,
      snapshot
    }, { session: context.session });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    receipt = await receiptRepository.findByInvoice(invoice._id, {
      session: context.session
    });
  }
  return invoiceRepository.updateInvoice(invoice._id, {
    captured_at: receipt.captured_at,
    receipt_number: receipt.receipt_number,
    receipt_snapshot: receipt.snapshot
  }, { session: context.session });
}

module.exports = { buildReceiptSnapshot, captureReceipt };
