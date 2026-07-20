// Phase 5.6 — Subscription lifecycle + sync về Organization
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const OrganizationPlanHistory = require('../models/OrganizationPlanHistory');
const { countActiveBuildings, countActiveUsers } = require('../utils/planQuota');
const {
  isPaidPlan,
  getPaidPlanCodes,
  getKnownPlanCodes,
  assertPlanCode,
  getPlanPeriodDays
} = require('./planCatalog');
const {
  GRACE_PERIOD_DAYS,
  GRACE_PERIOD_MS,
  ARCHIVE_AFTER_EXPIRED_MS
} = require('../utils/billingConstants');

/** @deprecated dùng getKnownPlanCodes() — giữ alias tương thích test cũ */
const VALID_PLANS = ['FREE', 'PRO', 'ENTERPRISE'];
/** @deprecated dùng getPaidPlanCodes() / isPaidPlan() */
const PAID_PLANS = ['PRO', 'ENTERPRISE'];
const DEFAULT_PERIOD_DAYS = 30;

function graceEndsAtFromNow() {
  return new Date(Date.now() + GRACE_PERIOD_MS);
}

function defaultPeriod(days = DEFAULT_PERIOD_DAYS) {
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return { start, end };
}

async function recordPlanHistory(org, meta) {
  try {
    const [buildingsActive, usersActive] = await Promise.all([
      countActiveBuildings(org._id),
      countActiveUsers(org._id)
    ]);
    await OrganizationPlanHistory.create({
      organization_id: org._id,
      from_plan: meta.from_plan ?? null,
      to_plan: meta.to_plan,
      from_billing_status: meta.from_billing_status ?? null,
      to_billing_status: meta.to_billing_status ?? org.billing_status,
      changed_by: meta.changed_by ?? null,
      source: meta.source || 'PAYMENT',
      note: meta.note || '',
      snapshot: { buildings_active: buildingsActive, users_active: usersActive }
    });
  } catch (e) {
    console.warn('subscriptionLifecycle.recordPlanHistory:', e.message);
  }
}

async function getCurrentSubscription(organizationId) {
  if (!organizationId) return null;
  return Subscription.findOne({
    organization_id: organizationId,
    is_current: true
  });
}

/**
 * Sync Organization.plan / billing fields từ subscription hiện hành.
 */
async function syncOrganizationFromSubscription(org, subscription, options = {}) {
  if (!org || !subscription) return org;

  const prev = {
    plan: org.plan,
    billing_status: org.billing_status,
    plan_started_at: org.plan_started_at ? new Date(org.plan_started_at).toISOString() : null,
    plan_expires_at: org.plan_expires_at ? new Date(org.plan_expires_at).toISOString() : null
  };

  const status = String(subscription.status || '').toUpperCase();

  if (status === 'ACTIVE' || status === 'TRIALING') {
    org.plan = subscription.plan || org.plan;
    org.billing_status = 'ACTIVE';
    org.grace_ends_at = null;
    org.billing_expired_at = null;
    org.archived_at = null;
    org.plan_started_at = subscription.current_period_start || org.plan_started_at || new Date();
    org.plan_expires_at = subscription.current_period_end || null;
  } else if (status === 'GRACE_PERIOD') {
    org.billing_status = 'GRACE_PERIOD';
    // Giữ gói đã mua (hiển thị + renew) — không hạ FREE trong grace
    org.plan = subscription.plan || org.plan;
    org.plan_started_at = subscription.current_period_start || org.plan_started_at;
    org.plan_expires_at = subscription.current_period_end || org.plan_expires_at;
    const metaGrace = subscription.metadata?.grace_ends_at;
    org.grace_ends_at = metaGrace ? new Date(metaGrace) : (org.grace_ends_at || graceEndsAtFromNow());
    org.archived_at = null;
  } else if (status === 'PAST_DUE') {
    // Legacy: coi như grace
    org.billing_status = 'GRACE_PERIOD';
    org.grace_ends_at = org.grace_ends_at || graceEndsAtFromNow();
    org.archived_at = null;
  } else if (status === 'EXPIRED' || status === 'CANCELED') {
    // Giữ plan đã mua để UI/renew; khóa bằng billing_status (không xóa dữ liệu)
    if (subscription.plan && subscription.plan !== 'FREE') {
      org.plan = subscription.plan;
    }
    org.billing_status = 'EXPIRED';
    org.grace_ends_at = null;
    if (!org.billing_expired_at) org.billing_expired_at = new Date();
    org.plan_started_at = subscription.current_period_start || org.plan_started_at;
    org.plan_expires_at = subscription.current_period_end || org.plan_expires_at || new Date();
  } else if (status === 'ARCHIVED') {
    if (subscription.plan && subscription.plan !== 'FREE') {
      org.plan = subscription.plan;
    }
    org.billing_status = 'ARCHIVED';
    org.grace_ends_at = null;
    org.archived_at = org.archived_at || new Date();
    if (!org.billing_expired_at) org.billing_expired_at = org.plan_expires_at || new Date();
  }

  if (typeof org.save === 'function') {
    await org.save();
  }

  const changed =
    prev.plan !== org.plan ||
    prev.billing_status !== org.billing_status ||
    prev.plan_started_at !== (org.plan_started_at ? new Date(org.plan_started_at).toISOString() : null) ||
    prev.plan_expires_at !== (org.plan_expires_at ? new Date(org.plan_expires_at).toISOString() : null);

  if (changed && options.recordHistory !== false) {
    await recordPlanHistory(org, {
      from_plan: prev.plan,
      to_plan: org.plan,
      from_billing_status: prev.billing_status,
      to_billing_status: org.billing_status,
      changed_by: options.changed_by || null,
      source: options.source || 'PAYMENT',
      note: options.note || `[SUBSCRIPTION:${status}] ${subscription.note || ''}`.trim()
    });
  }

  return org;
}

/**
 * ACTIVE/TRIALING quá hạn chu kỳ → GRACE_PERIOD (15 ngày).
 * GRACE_PERIOD quá grace → EXPIRED (giữ plan, không xóa data).
 * EXPIRED sau 90 ngày → ARCHIVED.
 */
async function refreshSubscriptionStatus(org, subscription) {
  if (!org || !subscription) return { org, subscription };

  const now = Date.now();
  const end = subscription.current_period_end
    ? new Date(subscription.current_period_end).getTime()
    : null;
  const graceEnd = org.grace_ends_at
    ? new Date(org.grace_ends_at).getTime()
    : (subscription.metadata?.grace_ends_at
      ? new Date(subscription.metadata.grace_ends_at).getTime()
      : null);

  // ARCHIVED: không chuyển ngược trừ khi thanh toán (activateOrRenew)
  if (subscription.status === 'ARCHIVED' || org.billing_status === 'ARCHIVED') {
    if (subscription.status !== 'ARCHIVED') {
      subscription.status = 'ARCHIVED';
      await subscription.save();
    }
    await syncOrganizationFromSubscription(org, subscription, {
      source: 'SYSTEM',
      note: 'Đồng bộ ARCHIVED',
      recordHistory: false
    });
    return { org, subscription };
  }

  if (subscription.status === 'EXPIRED' || org.billing_status === 'EXPIRED') {
    const expiredAt = org.billing_expired_at
      ? new Date(org.billing_expired_at).getTime()
      : (org.plan_expires_at ? new Date(org.plan_expires_at).getTime() : null);
    if (expiredAt && expiredAt + ARCHIVE_AFTER_EXPIRED_MS <= now) {
      subscription.status = 'ARCHIVED';
      await subscription.save();
      org.archived_at = new Date();
      await syncOrganizationFromSubscription(org, subscription, {
        source: 'SYSTEM',
        note: 'Hết 90 ngày EXPIRED → ARCHIVED (auto)'
      });
      return { org, subscription };
    }
    if (subscription.status !== 'EXPIRED') {
      subscription.status = 'EXPIRED';
      await subscription.save();
      await syncOrganizationFromSubscription(org, subscription, {
        source: 'SYSTEM',
        note: 'Đồng bộ EXPIRED',
        recordHistory: false
      });
    }
    return { org, subscription };
  }

  if (subscription.status === 'GRACE_PERIOD' && graceEnd && graceEnd <= now) {
    subscription.status = 'EXPIRED';
    // Giữ plan trên subscription để renew / hiển thị
    await subscription.save();
    org.billing_expired_at = new Date();
    await syncOrganizationFromSubscription(org, subscription, {
      source: 'SYSTEM',
      note: `Hết thời gian gia hạn ${GRACE_PERIOD_DAYS} ngày (auto)`
    });
    return { org, subscription };
  }

  if (
    ['ACTIVE', 'TRIALING'].includes(subscription.status) &&
    end &&
    end <= now
  ) {
    const gEnd = graceEndsAtFromNow();
    subscription.status = 'GRACE_PERIOD';
    subscription.metadata = { ...(subscription.metadata || {}), grace_ends_at: gEnd.toISOString() };
    org.grace_ends_at = gEnd;
    await subscription.save();
    await syncOrganizationFromSubscription(org, subscription, {
      source: 'SYSTEM',
      note: `Chu kỳ hết hạn → gia hạn ${GRACE_PERIOD_DAYS} ngày (auto)`
    });
    return { org, subscription };
  }

  if (
    subscription.status === 'PAST_DUE' &&
    graceEnd &&
    graceEnd <= now
  ) {
    subscription.status = 'EXPIRED';
    await subscription.save();
    org.billing_expired_at = new Date();
    await syncOrganizationFromSubscription(org, subscription, {
      source: 'SYSTEM',
      note: 'PAST_DUE hết grace (auto)'
    });
  }

  return { org, subscription };
}

function nextInvoiceNumber(orgId) {
  const short = String(orgId).slice(-6);
  return `INV-${short}-${Date.now()}`;
}

async function createOpenInvoice({
  org,
  plan,
  amount = 0,
  currency = 'VND',
  periodStart,
  periodEnd,
  externalRef = '',
  idempotencyKey = '',
  note = '',
  createdBy = null,
  metadata = {}
}) {
  let key = idempotencyKey;
  if (key) {
    const existed = await Invoice.findOne({
      organization_id: org._id,
      idempotency_key: key
    });
    if (existed) {
      if (existed.status === 'OPEN') {
        return { invoice: existed, duplicated: true };
      }
      key = `${key}-${Date.now()}`;
    }
  }

  const invoice = await Invoice.create({
    organization_id: org._id,
    subscription_id: null,
    billing_event_id: null,
    invoice_number: nextInvoiceNumber(org._id),
    status: 'OPEN',
    plan: plan || org.plan,
    amount: Number(amount) || 0,
    currency: String(currency || 'VND').toUpperCase(),
    period_start: periodStart || null,
    period_end: periodEnd || null,
    paid_at: null,
    due_at: periodEnd || new Date(Date.now() + 24 * 60 * 60 * 1000),
    external_ref: externalRef || '',
    idempotency_key: key || '',
    note: note || '',
    metadata: metadata || {},
    created_by: createdBy
  });

  return { invoice, duplicated: false };
}

async function markInvoicePaid(invoice, { externalRef = '', subscriptionId = null, billingEventId = null, provider = 'MANUAL', createdBy = null } = {}) {
  if (!invoice) return null;
  if (invoice.status === 'PAID') return invoice;
  invoice.status = 'PAID';
  invoice.paid_at = new Date();
  if (externalRef) invoice.external_ref = externalRef;
  if (subscriptionId) invoice.subscription_id = subscriptionId;
  if (billingEventId) invoice.billing_event_id = billingEventId;
  await invoice.save();

  try {
    const { recordPaymentFromInvoice } = require('./paymentLedger');
    await recordPaymentFromInvoice(invoice, {
      method: provider,
      external_ref: externalRef || invoice.external_ref || '',
      created_by: createdBy,
      note: `Thanh toán ${provider}`
    });
  } catch (e) {
    console.warn('paymentLedger record failed:', e.message);
  }

  return invoice;
}

async function createPaidInvoice({
  org,
  subscription,
  amount = 0,
  currency = 'VND',
  periodStart,
  periodEnd,
  externalRef = '',
  idempotencyKey = '',
  billingEventId = null,
  note = '',
  createdBy = null,
  metadata = {}
}) {
  if (idempotencyKey) {
    const existed = await Invoice.findOne({
      organization_id: org._id,
      idempotency_key: idempotencyKey
    });
    if (existed) return { invoice: existed, duplicated: true };
  }

  const invoice = await Invoice.create({
    organization_id: org._id,
    subscription_id: subscription?._id || null,
    billing_event_id: billingEventId,
    invoice_number: nextInvoiceNumber(org._id),
    status: 'PAID',
    plan: subscription?.plan || org.plan,
    amount: Number(amount) || 0,
    currency: String(currency || 'VND').toUpperCase(),
    period_start: periodStart || null,
    period_end: periodEnd || null,
    paid_at: new Date(),
    due_at: periodEnd || null,
    external_ref: externalRef || '',
    idempotency_key: idempotencyKey || '',
    note: note || '',
    metadata: metadata || {},
    created_by: createdBy
  });

  try {
    const { recordPaymentFromInvoice } = require('./paymentLedger');
    await recordPaymentFromInvoice(invoice, {
      method: (metadata && metadata.provider) || 'MANUAL',
      created_by: createdBy,
      note: note || 'Manual paid invoice'
    });
  } catch (e) {
    console.warn('paymentLedger record (paid invoice) failed:', e.message);
  }

  return { invoice, duplicated: false };
}

/**
 * Activate / renew paid subscription (PAID).
 * Hạ subscription cũ (is_current=false), tạo hoặc cập nhật current.
 */
async function activateOrRenewSubscription({
  org,
  plan,
  periodStart,
  periodEnd,
  amount = 0,
  currency = 'VND',
  provider = 'MANUAL',
  providerSubscriptionId = '',
  externalRef = '',
  idempotencyKey = '',
  billingEventId = null,
  note = '',
  createdBy = null,
  metadata = {},
  recordHistory = true
}) {
  const nextPlan = await assertPlanCode(plan || 'PRO', { mustBePaid: true });

  const periodDays = getPlanPeriodDays(nextPlan) || DEFAULT_PERIOD_DAYS;
  const period = {
    start: periodStart ? new Date(periodStart) : defaultPeriod(periodDays).start,
    end: periodEnd ? new Date(periodEnd) : defaultPeriod(periodDays).end
  };
  if (Number.isNaN(period.start.getTime()) || Number.isNaN(period.end.getTime())) {
    throw Object.assign(new Error('period_start/period_end không hợp lệ.'), { status: 400 });
  }
  if (period.end.getTime() <= period.start.getTime()) {
    throw Object.assign(new Error('period_end phải lớn hơn period_start.'), { status: 400 });
  }

  // Hạ is_current cũ
  await Subscription.updateMany(
    { organization_id: org._id, is_current: true },
    { $set: { is_current: false } }
  );

  const subscription = await Subscription.create({
    organization_id: org._id,
    plan: nextPlan,
    status: 'ACTIVE',
    current_period_start: period.start,
    current_period_end: period.end,
    cancel_at_period_end: false,
    canceled_at: null,
    provider: provider || 'MANUAL',
    provider_subscription_id: providerSubscriptionId || '',
    is_current: true,
    note: note || '',
    metadata: metadata || {},
    created_by: createdBy
  });

  await syncOrganizationFromSubscription(org, subscription, {
    changed_by: createdBy,
    source: 'PAYMENT',
    note: note || `Kích hoạt subscription ${nextPlan}`,
    recordHistory
  });

  const { invoice } = await createPaidInvoice({
    org,
    subscription,
    amount,
    currency,
    periodStart: period.start,
    periodEnd: period.end,
    externalRef,
    idempotencyKey: idempotencyKey ? `inv-${idempotencyKey}` : '',
    billingEventId,
    note,
    createdBy,
    metadata
  });

  return { subscription, invoice, organization: org };
}

async function markSubscriptionPastDue(org, options = {}) {
  let subscription = await getCurrentSubscription(org._id);
  if (!subscription) {
    org.billing_status = 'GRACE_PERIOD';
    org.grace_ends_at = graceEndsAtFromNow();
    await org.save();
    return { organization: org, subscription: null };
  }

  const gEnd = graceEndsAtFromNow();
  subscription.status = 'GRACE_PERIOD';
  subscription.metadata = { ...(subscription.metadata || {}), grace_ends_at: gEnd.toISOString() };
  if (options.note) subscription.note = options.note;
  org.grace_ends_at = gEnd;
  await subscription.save();
  await syncOrganizationFromSubscription(org, subscription, {
    changed_by: options.createdBy || null,
    source: options.source || 'PAYMENT',
    note: options.note || 'Thanh toán thất bại → gia hạn 7 ngày',
    recordHistory: options.recordHistory !== false
  });
  return { organization: org, subscription };
}

async function expireCurrentSubscription(org, options = {}) {
  let subscription = await getCurrentSubscription(org._id);
  const keepPlan = (subscription && subscription.plan && subscription.plan !== 'FREE')
    ? subscription.plan
    : (org.plan && org.plan !== 'FREE' ? org.plan : 'FREE');

  if (!subscription) {
    await Subscription.updateMany(
      { organization_id: org._id, is_current: true },
      { $set: { is_current: false } }
    );
    subscription = await Subscription.create({
      organization_id: org._id,
      plan: keepPlan,
      status: 'EXPIRED',
      current_period_start: org.plan_started_at || new Date(),
      current_period_end: org.plan_expires_at || new Date(),
      is_current: true,
      provider: 'MANUAL',
      note: options.note || 'Hết hạn gói',
      created_by: options.createdBy || null
    });
  } else {
    subscription.status = 'EXPIRED';
    // Giữ plan đã mua — không xóa dữ liệu; khóa bằng billing_status
    if (!subscription.current_period_end) subscription.current_period_end = new Date();
    if (options.note) subscription.note = options.note;
    await subscription.save();
  }

  org.billing_expired_at = org.billing_expired_at || new Date();
  await syncOrganizationFromSubscription(org, subscription, {
    changed_by: options.createdBy || null,
    source: options.source || 'PAYMENT',
    note: options.note || 'Subscription hết hạn (giữ dữ liệu + plan)',
    recordHistory: options.recordHistory !== false
  });

  return { organization: org, subscription };
}

async function cancelCurrentSubscription(org, options = {}) {
  const subscription = await getCurrentSubscription(org._id);
  if (!subscription) {
    throw Object.assign(new Error('Không có subscription hiện hành để hủy.'), { status: 404 });
  }

  const immediate = options.immediate !== false;
  if (immediate) {
    subscription.status = 'CANCELED';
    subscription.canceled_at = new Date();
    subscription.cancel_at_period_end = false;
    subscription.plan = 'FREE';
    await subscription.save();
    await syncOrganizationFromSubscription(org, subscription, {
      changed_by: options.createdBy || null,
      source: options.source || 'MANUAL_SUPER_ADMIN',
      note: options.note || 'Hủy subscription ngay',
      recordHistory: true
    });
  } else {
    subscription.cancel_at_period_end = true;
    subscription.canceled_at = new Date();
    await subscription.save();
  }

  return { organization: org, subscription };
}

/**
 * Áp billing event → subscription lifecycle.
 * Gọi sau khi đã lưu OrganizationBillingEvent.
 */
async function applyBillingEventToSubscription(org, event) {
  const paymentStatus = String(event.payment_status || '').toUpperCase();
  const plan = event.plan ? String(event.plan).toUpperCase() : null;

  if (paymentStatus === 'PAID' && isPaidPlan(plan)) {
    return activateOrRenewSubscription({
      org,
      plan,
      periodStart: event.period_start_at,
      periodEnd: event.period_end_at,
      amount: event.amount,
      currency: event.currency,
      externalRef: event.external_ref,
      idempotencyKey: event.idempotency_key,
      billingEventId: event._id,
      note: event.note || `[${event.event_type}]`,
      createdBy: event.created_by,
      metadata: event.metadata || {},
      // History đã có thể được ghi từ billing event path — tránh double nếu caller tắt
      recordHistory: false
    });
  }

  if (paymentStatus === 'FAILED') {
    return markSubscriptionPastDue(org, {
      createdBy: event.created_by,
      note: event.note || `[${event.event_type}]`,
      source: 'PAYMENT',
      recordHistory: false
    });
  }

  if (paymentStatus === 'EXPIRED' || paymentStatus === 'REFUNDED') {
    return expireCurrentSubscription(org, {
      createdBy: event.created_by,
      note: event.note || `[${event.event_type}]`,
      source: 'PAYMENT',
      recordHistory: false
    });
  }

  // PENDING / khác — không đổi subscription
  const subscription = await getCurrentSubscription(org._id);
  return { organization: org, subscription, invoice: null };
}

module.exports = {
  VALID_PLANS,
  PAID_PLANS,
  getKnownPlanCodes,
  getPaidPlanCodes,
  GRACE_PERIOD_DAYS,
  isPaidPlan,
  getCurrentSubscription,
  syncOrganizationFromSubscription,
  refreshSubscriptionStatus,
  activateOrRenewSubscription,
  markSubscriptionPastDue,
  expireCurrentSubscription,
  cancelCurrentSubscription,
  applyBillingEventToSubscription,
  createPaidInvoice,
  createOpenInvoice,
  markInvoicePaid,
  defaultPeriod,
  graceEndsAtFromNow
};
