// Phase 5.7/5.8 — Checkout + hoàn tất thanh toán (VNPay / TPTPpay)
const QRCode = require('qrcode');
const billingEventRepository = require('../repositories/billingEventRepository');
const invoiceRepository = require('../repositories/invoiceRepository');
const billingOrganizationRepository = require('../repositories/billingOrganizationRepository');
const activityLogRepository = require('../repositories/activityLogRepository');
const { getPlanPrice, getPlanPeriodDays } = require('../config/planPricing');
const { assertPlanCode } = require('./planCatalog');
const {
  defaultPeriod
} = require('./subscriptionLifecycle');
const {
  createOpenInvoice,
  applyBillingEventToSubscription,
  markInvoicePaid,
  getCurrentSubscription
} = require('../application/billing/subscriptionApplicationService');
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
const eventBus = require('../shared/events/eventBus');
const EVENT_TYPES = require('../shared/events/eventTypes');
const {
  finalizeSuccessfulPayment
} = require('../application/billing/finalizeSuccessfulPayment');

function checkoutIdempotencyKey(orgId, plan, action) {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  return `chk-${orgId}-${plan}-${action}-${bucket}`;
}

function deterministicBillingEventId(orgId, idempotencyKey) {
  return billingEventRepository.deterministicEventId(orgId, idempotencyKey);
}

const EVENT_PROCESSING_STALE_MS = 60 * 1000;
const EVENT_WAIT_ATTEMPTS = 100;
const EVENT_WAIT_MS = 50;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimBillingEvent(eventId) {
  const staleBefore = new Date(Date.now() - EVENT_PROCESSING_STALE_MS);
  return billingEventRepository.claimForProcessing(eventId, staleBefore);
}

async function waitForBillingEvent(eventId) {
  for (let attempt = 0; attempt < EVENT_WAIT_ATTEMPTS; attempt += 1) {
    const event = await billingEventRepository.findById(eventId);
    if (!event || event.processing_status === 'APPLIED' || event.processing_status === 'FAILED') {
      return event;
    }
    await delay(EVENT_WAIT_MS);
  }
  return billingEventRepository.findById(eventId);
}

/**
 * Tạo hóa đơn OPEN + URL thanh toán.
 */
async function createCheckoutSession({ org, plan, action = 'upgrade', userId, ipAddr }) {
  const nextPlan = await assertPlanCode(plan || 'PRO', {
    mustBePaid: true,
    mustBeActive: true
  });

  const amount = getPlanPrice(nextPlan);
  if (!amount) {
    throw Object.assign(new Error('Không có giá cho gói này.'), { status: 400 });
  }

  const period = defaultPeriod(getPlanPeriodDays(nextPlan));
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
  let qrDataUrl = null;
  let deepLink = null;

  if (provider === 'VNPAY') {
    checkoutUrl = createVnpayPaymentUrl({
      amount,
      txnRef: invoice.invoice_number,
      orderInfo: `Goi ${nextPlan} - ${org.name || org.slug}`,
      ipAddr
    });
    invoice = await invoiceRepository.updateInvoice(invoice._id, {
      metadata: {
        ...(invoice.metadata || {}),
        provider: 'VNPAY',
        txn_ref: invoice.invoice_number
      }
    });
  } else if (provider === 'TPTPPAY') {
    const nonce = generatePaymentNonce();
    const { token, exp } = createPaymentAccessToken(invoice._id, org._id, userId, nonce);
    checkoutUrl = buildTptpPayUrl(invoice._id, token);
    // QR quét bằng app TPTPbank — dùng chung schema deep link với gói cá nhân
    deepLink = `tptpbank://pay?invoiceId=${encodeURIComponent(String(invoice._id))}&token=${encodeURIComponent(token)}`;
    try {
      qrDataUrl = await QRCode.toDataURL(deepLink, { width: 260, margin: 1, errorCorrectionLevel: 'M' });
    } catch (_) { qrDataUrl = null; }
    invoice = await invoiceRepository.updateInvoice(invoice._id, {
      metadata: {
        ...(invoice.metadata || {}),
        provider: 'TPTPPAY',
        payment_nonce: nonce,
        payment_token_exp: exp,
        payment_initiated_by: userId,
        payment_initiated_ip: ipAddr || ''
      }
    });
  } else {
    throw Object.assign(
      new Error(
        'Cổng thanh toán chưa được cấu hình. Bật TPTP_SANDBOX_ENABLED=true (dev) hoặc cấu hình VNPay (VNPAY_TMN_CODE).'
      ),
      { status: 503 }
    );
  }

  return { invoice, provider, checkout_url: checkoutUrl, qr_data_url: qrDataUrl, deep_link: deepLink, duplicated };
}

/**
 * Xử lý thanh toán thành công (webhook / mock / return URL).
 */
async function completeCheckoutPaymentLegacy({
  invoice,
  externalRef = '',
  provider = 'MANUAL',
  userId = null,
  note = ''
}) {
  if (!invoice) {
    throw Object.assign(new Error('Không tìm thấy hóa đơn.'), { status: 404 });
  }
  invoice = await invoiceRepository.findById(invoice._id || invoice.id);
  if (!invoice) {
    throw Object.assign(new Error('Không tìm thấy hóa đơn.'), { status: 404 });
  }
  if (invoice.status === 'PAID') {
    const sub = await getCurrentSubscription(invoice.organization_id);
    invoice = await markInvoicePaid(invoice, {
      externalRef: invoice.external_ref || externalRef,
      subscriptionId: invoice.subscription_id || sub?._id,
      billingEventId: invoice.billing_event_id,
      provider,
      createdBy: userId
    });
    return { invoice, duplicated: true, subscription: sub };
  }
  if (invoice.status !== 'OPEN') {
    throw Object.assign(new Error(`Hóa đơn ở trạng thái ${invoice.status}, không thể thanh toán.`), { status: 400 });
  }

  const org = await billingOrganizationRepository.findBillingOrganizationById(
    invoice.organization_id
  );
  if (!org) {
    throw Object.assign(new Error('Không tìm thấy tổ chức.'), { status: 404 });
  }

  const plan = String(invoice.plan || 'PRO').toUpperCase();
  const periodStart = invoice.period_start || new Date();
  const periodEnd = invoice.period_end || defaultPeriod(getPlanPeriodDays(plan)).end;
  const idempotencyKey = `pay-${invoice.invoice_number}`;
  if (externalRef && !['MANUAL', 'MOCK'].includes(String(provider).toUpperCase())) {
    const { recordProviderTransaction } = require('./webhookInboxService');
    await recordProviderTransaction({
      provider: String(provider).toUpperCase(),
      provider_ref: String(externalRef),
      merchant_ref: invoice.invoice_number,
      status: 'SUCCESS',
      amount_minor: Math.round(
        Number(invoice.amount) - Number(invoice.discount_amount || 0) + Number(invoice.tax_amount || 0)
      ),
      currency: String(invoice.currency || 'VND').toUpperCase(),
      occurred_at: new Date(),
      invoice_id: invoice._id,
      provider_payload: {}
    });
  }

  let event = await billingEventRepository.findByOrganizationIdempotency(
    org._id,
    idempotencyKey
  );
  let duplicatedEvent = Boolean(event);
  if (!event) {
    try {
      event = await billingEventRepository.createEvent({
        // _id tất định là lớp chống race cuối cùng, không phụ thuộc việc DB cũ
        // đã tạo unique compound index hay chưa.
        _id: deterministicBillingEventId(org._id, idempotencyKey),
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
        event = await billingEventRepository.findByIdentityOrIdempotency({
          eventId: deterministicBillingEventId(org._id, idempotencyKey),
          organizationId: org._id,
          idempotencyKey
        });
        duplicatedEvent = true;
      }
      if (!event) throw err;
    }
  }

  let claimed = await claimBillingEvent(event._id);
  if (!claimed) {
    const completed = await waitForBillingEvent(event._id);
    if (completed?.processing_status === 'FAILED') {
      claimed = await claimBillingEvent(event._id);
    } else if (completed?.processing_status !== 'APPLIED') {
      throw Object.assign(
        new Error('Billing event đang được xử lý, vui lòng retry.'),
        { status: 409, code: 'PAYMENT_PROCESSING' }
      );
    }
  }

  if (!claimed) {
    const sub = await getCurrentSubscription(org._id);
    let freshInvoice = await invoiceRepository.findById(invoice._id);
    freshInvoice = await markInvoicePaid(freshInvoice, {
      externalRef: event.external_ref || externalRef,
      subscriptionId: freshInvoice.subscription_id || sub?._id,
      billingEventId: event._id,
      provider,
      createdBy: userId
    });
    return {
      invoice: freshInvoice,
      event,
      duplicated: true,
      subscription: sub
    };
  }

  let result;
  try {
    result = await applyBillingEventToSubscription(org, claimed);
    await billingEventRepository.markApplied(claimed._id);
  } catch (error) {
    await billingEventRepository.markFailed(claimed._id, error);
    throw error;
  }

  invoice = await markInvoicePaid(invoice, {
    externalRef: claimed.external_ref || externalRef,
    subscriptionId: result.subscription?._id,
    billingEventId: claimed._id,
    provider,
    createdBy: userId
  });
  const publishedPaymentEvent = await eventBus.publish({
    type: EVENT_TYPES.PAYMENT_SUCCEEDED,
    event_key: `payment-succeeded:${claimed._id}`,
    aggregate_type: 'OrganizationBillingEvent',
    aggregate_id: claimed._id,
    organization_id: org._id,
    actor_user_id: userId,
    payload: {
      invoice_id: String(invoice._id),
      billing_event_id: String(claimed._id),
      subscription_id: result.subscription?._id
        ? String(result.subscription._id)
        : null,
      amount: invoice.amount,
      provider,
      plan
    }
  });
  if (userId && !duplicatedEvent) {
    try {
      await activityLogRepository.recordActivity({
        user_id: userId,
        action: 'SUBSCRIPTION_PAYMENT',
        target_type: 'organization',
        target_id: String(org._id),
        target: org.name,
        details: {
          message: 'Thanh toán gói thành công — kích hoạt/gia hạn subscription',
          plan,
          amount: invoice.amount,
          provider,
          invoice_number: invoice.invoice_number,
          invoice_id: String(invoice._id),
          subscription_id: result.subscription?._id
            ? String(result.subscription._id)
            : null
        },
        ip_address: '',
        organization_id: org._id
      });
    } catch (_) { /* không chặn luồng thanh toán nếu log lỗi */ }
  }

  return {
    invoice,
    event: claimed,
    subscription: result.subscription,
    organization: result.organization,
    duplicated: duplicatedEvent || Boolean(result.duplicated)
  };
}

async function completeCheckoutPayment({
  invoice,
  externalRef = '',
  provider = 'MANUAL',
  userId = null,
  note = ''
}) {
  const current = await invoiceRepository.findById(invoice?._id || invoice?.id);
  if (!current) {
    throw Object.assign(new Error('Không tìm thấy hóa đơn.'), { status: 404 });
  }
  const normalizedProvider = String(provider || 'MANUAL').toUpperCase();
  if (externalRef && !['MANUAL', 'MOCK'].includes(normalizedProvider)) {
    const { recordProviderTransaction } = require('./webhookInboxService');
    await recordProviderTransaction({
      provider: normalizedProvider,
      provider_ref: String(externalRef),
      merchant_ref: current.invoice_number,
      status: 'SUCCESS',
      amount_minor: Math.round(
        Number(current.amount) -
          Number(current.discount_amount || 0) +
          Number(current.tax_amount || 0)
      ),
      currency: String(current.currency || 'VND').toUpperCase(),
      occurred_at: new Date(),
      invoice_id: current._id,
      provider_payload: {}
    });
  }
  return finalizeSuccessfulPayment({
    invoiceId: current._id,
    externalRef,
    provider: normalizedProvider,
    userId,
    note
  });
}

async function findInvoiceByTxnRef(txnRef) {
  return invoiceRepository.findByTransactionReference(txnRef);
}

module.exports = {
  createCheckoutSession,
  completeCheckoutPayment,
  findInvoiceByTxnRef,
  isTptpSandboxEnabled
};
