const crypto = require('crypto');
const { formatVnpayDate } = require('../vnpayService');

function buildRefundSecureHash(params, secret) {
  const signData = [
    params.vnp_RequestId,
    params.vnp_Version,
    params.vnp_Command,
    params.vnp_TmnCode,
    params.vnp_TransactionType,
    params.vnp_TxnRef,
    params.vnp_Amount,
    params.vnp_TransactionNo,
    params.vnp_TransactionDate,
    params.vnp_CreateBy,
    params.vnp_CreateDate,
    params.vnp_IpAddr,
    params.vnp_OrderInfo
  ].join('|');
  return crypto
    .createHmac('sha512', secret)
    .update(Buffer.from(signData, 'utf8'))
    .digest('hex');
}

function configured() {
  return Boolean(
    process.env.VNPAY_API_URL &&
      process.env.VNPAY_TMN_CODE &&
      process.env.VNPAY_HASH_SECRET &&
      String(process.env.VNPAY_REFUND_ENABLED).toLowerCase() === 'true'
  );
}

async function applyRefund({ refund, payment, invoice, ipAddr = '127.0.0.1' }) {
  if (!configured()) {
    throw Object.assign(new Error('VNPay Refund API chưa được bật/cấu hình.'), {
      status: 503,
      code: 'VNPAY_REFUND_NOT_CONFIGURED'
    });
  }
  const requestId =
    refund.provider_refund_id ||
    crypto.createHash('sha256').update(`vnpay-refund:${refund._id}`).digest('hex').slice(0, 32);
  const transactionNo =
    payment.metadata?.vnp_TransactionNo ||
    payment.metadata?.transaction_no ||
    '';
  const transactionDate = formatVnpayDate(payment.paid_at || new Date());
  const createDate = formatVnpayDate();
  const params = {
    vnp_RequestId: requestId,
    vnp_Version: '2.1.0',
    vnp_Command: 'refund',
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_TransactionType: '02',
    vnp_TxnRef: invoice?.invoice_number || payment.metadata?.invoice_number || String(payment._id),
    vnp_Amount: Math.round(Number(refund.amount) * 100),
    vnp_TransactionNo: transactionNo,
    vnp_TransactionDate: transactionDate,
    vnp_CreateBy: String(refund.requested_by || 'system').slice(0, 50),
    vnp_CreateDate: createDate,
    vnp_IpAddr: ipAddr,
    vnp_OrderInfo: String(refund.reason || `Refund ${payment._id}`).slice(0, 255)
  };
  params.vnp_SecureHash = buildRefundSecureHash(
    params,
    process.env.VNPAY_HASH_SECRET
  );

  const response = await fetch(process.env.VNPAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(Number(process.env.VNPAY_API_TIMEOUT_MS) || 15000)
  });
  const raw = await response.json().catch(() => ({}));
  const code = String(raw.vnp_ResponseCode || raw.vnp_ResponseId || '');
  if (!response.ok || code !== '00') {
    throw Object.assign(
      new Error(raw.vnp_Message || `VNPay từ chối hoàn tiền (${code || response.status}).`),
      { status: 502, code: 'VNPAY_REFUND_FAILED', providerResponse: raw }
    );
  }
  return {
    status: 'COMPLETED',
    provider_refund_id: String(raw.vnp_TransactionNo || requestId),
    provider_status: code,
    response: {
      vnp_ResponseCode: code,
      vnp_Message: raw.vnp_Message || '',
      vnp_TransactionNo: raw.vnp_TransactionNo || ''
    }
  };
}

module.exports = { applyRefund, configured, buildRefundSecureHash };
