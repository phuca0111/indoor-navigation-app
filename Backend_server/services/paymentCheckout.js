// Phase 5.7/5.8 — Checkout + hoàn tất thanh toán (VNPay / TPTPpay)
const OrganizationBillingEvent = require('../models/OrganizationBillingEvent');
const Invoice = require('../models/Invoice');
const { getPlanPrice, PLAN_PERIOD_DAYS } = require('../config/planPricing');
const {
  isPaidPlan,
  defaultPeriod,
  createOpenInvoice,
  applyBillingEventToSubscription,
  markInvoicePaid,
  getCurrentSubscription
} = require('./subscriptionLifecycle');
const { isVnpayConfigured, createVnpayPaymentUrl, getBaseUrl } = require('./vnpayService');
const {
  generatePaymentNonce,
  createPaymentAccessToken
} = require('./paymentAccessToken');
const {
  getCheckoutProvider,
  buildTptpPayUrl,
  isTptpSandboxEnabled
} = require('./tptpSandboxService');

function checkoutIdempotencyKey(orgId, plan, action) {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  return `chk-${orgId}-${plan}-${action}-${bucket}`;
}

/**
 * Tạo hóa đơn OPEN + URL thanh toán.
 */
async function createCheckoutSession({ org, plan, action = 'upgrade', userId, ipAddr }) {
  const nextPlan = String(plan || 'PRO').toUpperCase();
  if (!isPaidPlan(nextPlan)) {
    throw Object.assign(new Error('plan phải là PRO hoặc ENTERPRISE.'), { status: 400 });
  }

  const amount = getPlanPrice(nextPlan);
  if (!amount) {
    throw Object.assign(new Error('Không có giá cho gói này.'), { status: 400 });
  }

  const period = defaultPeriod(PLAN_PERIOD_DAYS);
  const idempotencyKey = checkoutIdempotencyKey(org._id, nextPlan, action);

  const providerChoice = getCheckoutProvider();
  let { invoice, duplicated } = await createOpenInvoice({
    org,
    plan: nextPlan,
    amount,
    currency: 'VND',
    periodStart: period.start,
    periodEnd: period.end,
    idempotencyKey,
    note: action === 'renew' ? 'Gia hạn gói' : `Nâng cấp lên ${nextPlan}`,
    createdBy: userId,
    metadata: { action, provider: providerChoice || 'NONE' }
  });

  if (invoice.status === 'PAID') {
    const retry = await createOpenInvoice({
      org,
      plan: nextPlan,
      amount,
      currency: 'VND',
      periodStart: period.start,
      periodEnd: period.end,
      idempotencyKey: `${idempotencyKey}-retry-${Date.now()}`,
      note: action === 'renew' ? 'Gia hạn gói' : `Nâng cấp lên ${nextPlan}`,
      createdBy: userId,
      metadata: { action, provider: providerChoice || 'NONE' }
    });
    invoice = retry.invoice;
    duplicated = false;
  }

  let provider = providerChoice;
  let checkoutUrl;

  if (provider === 'VNPAY') {
    checkoutUrl = createVnpayPaymentUrl({
      amount,
      txnRef: invoice.invoice_number,
      orderInfo: `Goi ${nextPlan} - ${org.name || org.slug}`,
      ipAddr
    });
    invoice.metadata = { ...(invoice.metadata || {}), provider: 'VNPAY', txn_ref: invoice.invoice_number };
    await invoice.save();
  } else if (provider === 'TPTPPAY') {
    const nonce = generatePaymentNonce();
    const { token, exp } = createPaymentAccessToken(invoice._id, org._id, userId, nonce);
    checkoutUrl = buildTptpPayUrl(invoice._id, token);
    invoice.metadata = {
      ...(invoice.metadata || {}),
      provider: 'TPTPPAY',
      payment_nonce: nonce,
      payment_token_exp: exp,
      payment_initiated_by: userId,
      payment_initiated_ip: ipAddr || ''
    };
    await invoice.save();
  } else {
    throw Object.assign(
      new Error(
        'Cổng thanh toán chưa được cấu hình. Bật TPTP_SANDBOX_ENABLED=true (dev) hoặc cấu hình VNPay (VNPAY_TMN_CODE).'
      ),
      { status: 503 }
    );
  }

  return { invoice, provider, checkout_url: checkoutUrl, duplicated };
}

/**
 * Xử lý thanh toán thành công (webhook / mock / return URL).
 */
async function completeCheckoutPayment({
  invoice,
  externalRef = '',
  provider = 'MANUAL',
  userId = null,
  note = ''
}) {
  if (!invoice) {
    throw Object.assign(new Error('Không tìm thấy hóa đơn.'), { status: 404 });
  }
  if (invoice.status === 'PAID') {
    const sub = await getCurrentSubscription(invoice.organization_id);
    return { invoice, duplicated: true, subscription: sub };
  }
  if (invoice.status !== 'OPEN') {
    throw Object.assign(new Error(`Hóa đơn ở trạng thái ${invoice.status}, không thể thanh toán.`), { status: 400 });
  }

  const Organization = require('../models/Organization');
  const org = await Organization.findById(invoice.organization_id);
  if (!org) {
    throw Object.assign(new Error('Không tìm thấy tổ chức.'), { status: 404 });
  }

  const plan = String(invoice.plan || 'PRO').toUpperCase();
  const periodStart = invoice.period_start || new Date();
  const periodEnd = invoice.period_end || defaultPeriod(PLAN_PERIOD_DAYS).end;
  const idempotencyKey = `pay-${invoice.invoice_number}`;

  let event;
  try {
    event = await OrganizationBillingEvent.create({
      organization_id: org._id,
      event_type: 'SUBSCRIPTION_PURCHASED',
      payment_status: 'PAID',
      plan,
      amount: invoice.amount,
      currency: invoice.currency,
      period_start_at: periodStart,
      period_end_at: periodEnd,
      external_ref: externalRef || invoice.external_ref || '',
      idempotency_key: idempotencyKey,
      note: note || `Thanh toán qua ${provider}`,
      metadata: { invoice_id: String(invoice._id), provider },
      created_by: userId
    });
  } catch (err) {
    if (err?.code === 11000) {
      const existed = await OrganizationBillingEvent.findOne({
        organization_id: org._id,
        idempotency_key: idempotencyKey
      });
      if (existed) {
        const sub = await getCurrentSubscription(org._id);
        await markInvoicePaid(invoice, {
          externalRef,
          subscriptionId: sub?._id,
          billingEventId: existed._id
        });
        return { invoice, event: existed, duplicated: true, subscription: sub };
      }
    }
    throw err;
  }

  const result = await applyBillingEventToSubscription(org, event);
  await markInvoicePaid(invoice, {
    externalRef,
    subscriptionId: result.subscription?._id,
    billingEventId: event._id
  });

  return {
    invoice,
    event,
    subscription: result.subscription,
    organization: result.organization,
    duplicated: false
  };
}

async function findInvoiceByTxnRef(txnRef) {
  if (!txnRef) return null;
  return Invoice.findOne({
    $or: [
      { invoice_number: txnRef },
      { idempotency_key: txnRef },
      { external_ref: txnRef }
    ]
  });
}

module.exports = {
  createCheckoutSession,
  completeCheckoutPayment,
  findInvoiceByTxnRef,
  isTptpSandboxEnabled
};
