const crypto = require('crypto');
const {
  createVnpayPaymentUrl,
  verifyVnpayParams,
  isVnpayConfigured
} = require('./vnpayService');
const legacyGateways = require('./paymentGateways');

function providerNotReady(provider, operation, missing = []) {
  return {
    ready: false,
    provider,
    operation,
    missing_credentials: missing,
    code: 'PROVIDER_NOT_CONFIGURED'
  };
}

const mockAdapter = {
  name: 'MOCK',
  ready: () => true,
  async createCheckout(input) {
    return { ready: true, provider: 'MOCK', checkout_url: `mock://checkout/${input.merchant_ref}` };
  },
  async verifyWebhook(input) {
    return { ok: true, provider: 'MOCK', event: input.payload || {} };
  },
  async query(input) {
    return { ready: true, provider: 'MOCK', provider_ref: input.provider_ref, status: 'SUCCESS' };
  },
  async refund(input) {
    return {
      ready: true,
      status: 'COMPLETED',
      provider_refund_id: input.refund?.provider_refund_id || `MOCK-R-${input.refund?._id || Date.now()}`
    };
  }
};

const vnpayAdapter = {
  name: 'VNPAY',
  ready: isVnpayConfigured,
  async createCheckout(input) {
    if (!isVnpayConfigured()) return providerNotReady('VNPAY', 'createCheckout', ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET', 'VNPAY_PAYMENT_URL']);
    return {
      ready: true,
      provider: 'VNPAY',
      checkout_url: createVnpayPaymentUrl({
        amount: input.amount,
        txnRef: input.merchant_ref,
        orderInfo: input.description,
        ipAddr: input.ip_address
      })
    };
  },
  async verifyWebhook(input) {
    const verified = verifyVnpayParams(input.payload || {});
    return { ...verified, provider: 'VNPAY' };
  },
  async query() {
    if (!process.env.VNPAY_API_URL || !isVnpayConfigured()) {
      return providerNotReady('VNPAY', 'query', ['VNPAY_API_URL']);
    }
    return { ready: true, provider: 'VNPAY', status: 'PROVIDER_QUERY_READY' };
  },
  async refund(input) {
    return legacyGateways.forPayment({ method: 'VNPAY' }).applyRefund(input);
  }
};

const tptpAdapter = {
  name: 'TPTP',
  ready: () => String(process.env.TPTP_SANDBOX_ENABLED || '').toLowerCase() === 'true',
  async createCheckout(input) {
    if (!this.ready()) return providerNotReady('TPTP', 'createCheckout', ['TPTP_SANDBOX_ENABLED']);
    return { ready: true, provider: 'TPTP', checkout_url: input.checkout_url || '' };
  },
  async verifyWebhook(input) {
    const secret = process.env.TPTP_WEBHOOK_SECRET;
    if (!secret) return { ok: false, ...providerNotReady('TPTP', 'verifyWebhook', ['TPTP_WEBHOOK_SECRET']) };
    const raw = typeof input.raw_body === 'string' ? input.raw_body : JSON.stringify(input.payload || {});
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const actual = String(input.signature || '');
    const ok = expected.length === actual.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
    return { ok, provider: 'TPTP', event: input.payload || {} };
  },
  async query() {
    return providerNotReady('TPTP', 'query', ['TPTP_QUERY_API_URL']);
  },
  async refund(input) {
    return legacyGateways.forPayment({ method: 'TPTP' }).applyRefund(input);
  }
};

const adapters = { MOCK: mockAdapter, VNPAY: vnpayAdapter, TPTP: tptpAdapter, TPTPPAY: tptpAdapter };

function getAdapter(provider) {
  const adapter = adapters[String(provider || '').toUpperCase()];
  if (!adapter) {
    throw Object.assign(new Error(`Cổng thanh toán ${provider || 'UNKNOWN'} không được hỗ trợ.`), {
      status: 400,
      code: 'PAYMENT_PROVIDER_UNSUPPORTED'
    });
  }
  return adapter;
}

module.exports = { getAdapter, providerNotReady, adapters };
