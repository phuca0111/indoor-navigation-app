const tptpGateway = require('./tptpGateway');
const vnpayGateway = require('./vnpayGateway');

const manualGateway = {
  async applyRefund({ refund, payment }) {
    return {
      status: 'COMPLETED',
      provider_refund_id: refund.provider_refund_id || payment.external_ref || '',
      provider_status: 'MANUAL_CONFIRMED',
      response: { manual: true }
    };
  }
};

function forPayment(payment) {
  const method = String(payment?.method || '').toUpperCase();
  if (method === 'TPTP') return tptpGateway;
  if (method === 'VNPAY') return vnpayGateway;
  if (method === 'MANUAL') return manualGateway;
  throw Object.assign(
    new Error(`Chưa hỗ trợ hoàn tiền tự động cho phương thức ${method || 'UNKNOWN'}.`),
    { status: 400, code: 'REFUND_PROVIDER_UNSUPPORTED' }
  );
}

module.exports = { forPayment };
