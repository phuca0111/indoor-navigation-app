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
      await completeCheckoutPayment({
        invoice,
        externalRef: params.vnp_TransactionNo || txnRef,
        provider: 'VNPAY',
        note: 'VNPay return URL thành công'
      });
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
    if (!verified.ok) {
      return res.status(200).json({ RspCode: '97', Message: 'Invalid signature' });
    }
    const params = verified.params;
    const txnRef = params.vnp_TxnRef;
    const invoice = await findInvoiceByTxnRef(txnRef);
    if (!invoice) {
      return res.status(200).json({ RspCode: '01', Message: 'Order not found' });
    }
    if (!parseVnpayResponseCode(params.vnp_ResponseCode)) {
      return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
    }
    await completeCheckoutPayment({
      invoice,
      externalRef: params.vnp_TransactionNo || txnRef,
      provider: 'VNPAY',
      note: 'VNPay IPN thành công'
    });
    return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (e) {
    console.error('vnpay ipn:', e);
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
});

module.exports = router;
