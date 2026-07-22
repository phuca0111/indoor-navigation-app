// Phase 5.7 — Webhook cổng thanh toán (không JWT)
const express = require('express');
const router = express.Router();
const {
  verifyVnpayParams,
  parseVnpayResponseCode
} = require('../services/vnpayService');
const {
  completeCheckoutPayment,
  findInvoiceByTxnRef
} = require('../services/paymentCheckout');
const {
  receiveWebhook,
  processWebhook,
  recordProviderTransaction
} = require('../services/webhookInboxService');
const { validateVnpayBusinessData } = require('../services/vnpayReconciliation');

async function processVerifiedVnpay(params, invoice, note, inbox = null) {
  const business = validateVnpayBusinessData(params, invoice);
  if (!business.ok) throw Object.assign(new Error(business.message), { status: 400, code: business.code });
  await recordProviderTransaction({
    provider: 'VNPAY',
    provider_ref: String(params.vnp_TransactionNo),
    merchant_ref: String(params.vnp_TxnRef),
    merchant_id: String(params.vnp_TmnCode || ''),
    terminal_id: String(params.vnp_TmnCode || ''),
    status: parseVnpayResponseCode(params.vnp_ResponseCode) ? 'SUCCESS' : 'FAILED',
    amount_minor: Math.round(Number(params.vnp_Amount) / 100),
    currency: String(params.vnp_CurrCode || 'VND').toUpperCase(),
    occurred_at: new Date(),
    invoice_id: invoice._id,
    webhook_inbox_id: inbox?._id || null,
    provider_payload: {
      response_code: params.vnp_ResponseCode,
      transaction_status: params.vnp_TransactionStatus || ''
    }
  });
  return completeCheckoutPayment({
    invoice,
    externalRef: params.vnp_TransactionNo,
    provider: 'VNPAY',
    note
  });
}

async function processVnpayThroughInbox(params, invoice, note, received = null) {
  const accepted = received || await receiveWebhook({
    provider: 'VNPAY',
    payload: params,
    signatureStatus: 'VALID'
  });
  const processed = await processWebhook(accepted.inbox, (inbox) =>
    processVerifiedVnpay(params, invoice, note, inbox)
  );
  if (processed.duplicated && processed.inbox?.process_status !== 'PROCESSED') {
    throw Object.assign(
      new Error('Webhook đang được xử lý, nhà cung cấp cần retry.'),
      { code: 'WEBHOOK_PROCESSING' }
    );
  }
  return processed.result || null;
}

// VNPay redirect (browser) sau thanh toán
router.get('/vnpay/return', async (req, res) => {
  try {
    const verified = verifyVnpayParams(req.query);
    if (!verified.ok) {
      return res.redirect('/admin/dashboard.html#billing?error=signature');
    }
    const params = verified.params;
    const txnRef = params.vnp_TxnRef;
    const invoice = await findInvoiceByTxnRef(txnRef);
    if (!invoice) {
      return res.redirect('/admin/dashboard.html#billing?error=invoice');
    }
    if (parseVnpayResponseCode(params.vnp_ResponseCode)) {
      await processVnpayThroughInbox(
        params,
        invoice,
        'VNPay return URL thành công'
      );
      return res.redirect('/admin/dashboard.html#billing?paid=1');
    }
    return res.redirect('/admin/dashboard.html#billing?error=payment');
  } catch (e) {
    console.error('vnpay return:', e);
    res.redirect('/admin/dashboard.html#billing?error=server');
  }
});

// VNPay IPN (server-to-server)
router.get('/vnpay/ipn', async (req, res) => {
  try {
    const verified = verifyVnpayParams(req.query);
    const received = await receiveWebhook({
      provider: 'VNPAY',
      payload: req.query,
      signatureStatus: verified.ok ? 'VALID' : 'INVALID'
    });
    if (!verified.ok) {
      return res.status(200).json({ RspCode: '97', Message: 'Invalid signature' });
    }
    const params = verified.params;
    const txnRef = params.vnp_TxnRef;
    const invoice = await findInvoiceByTxnRef(txnRef);
    if (!invoice) {
      return res.status(200).json({ RspCode: '01', Message: 'Order not found' });
    }
    if (!parseVnpayResponseCode(params.vnp_ResponseCode) ||
        (params.vnp_TransactionStatus && !parseVnpayResponseCode(params.vnp_TransactionStatus))) {
      return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
    }
    await processVnpayThroughInbox(
      params,
      invoice,
      'VNPay IPN thành công',
      received
    );
    return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (e) {
    console.error('vnpay ipn:', e);
    return res.status(200).json({
      RspCode: ['04', '97'].includes(e.code) ? e.code : '99',
      Message: e.message || 'Unknown error'
    });
  }
});

module.exports = router;
