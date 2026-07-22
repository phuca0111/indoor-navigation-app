const billingEventRepository = require('../../repositories/billingEventRepository');
const invoiceRepository = require('../../repositories/invoiceRepository');
const billingOrganizationRepository = require('../../repositories/billingOrganizationRepository');
const activityLogRepository = require('../../repositories/activityLogRepository');
const subscriptionLifecycle = require('../../services/subscriptionLifecycle');
const eventBus = require('../../shared/events/eventBus');
const EVENT_TYPES = require('../../shared/events/eventTypes');
const { getPlanPeriodDays } = require('../../config/planPricing');
const { runBillingCommand } = require('./runBillingCommand');

function paymentEventInput(invoice, org, input) {
  const plan = String(invoice.plan || 'PRO').toUpperCase();
  const period = subscriptionLifecycle.defaultPeriod(getPlanPeriodDays(plan));
  const idempotencyKey = `pay-${invoice.invoice_number}`;
  return {
    idempotencyKey,
    eventId: billingEventRepository.deterministicEventId(org._id, idempotencyKey),
    data: {
      organization_id: org._id,
      event_type: 'SUBSCRIPTION_PURCHASED',
      payment_status: 'PAID',
      plan,
      amount: invoice.amount,
      currency: invoice.currency,
      period_start_at: invoice.period_start || period.start,
      period_end_at: invoice.period_end || period.end,
      external_ref: input.externalRef || invoice.external_ref || '',
      idempotency_key: idempotencyKey,
      note: input.note || `Thanh toán qua ${input.provider}`,
      metadata: {
        invoice_id: String(invoice._id),
        provider: input.provider
      },
      created_by: input.userId
    }
  };
}

async function findOrCreateBillingEvent(invoice, org, input, session) {
  const definition = paymentEventInput(invoice, org, input);
  let event = await billingEventRepository.findByOrganizationIdempotency(
    org._id,
    definition.idempotencyKey,
    { session }
  );
  let duplicated = Boolean(event);
  if (!event) {
    try {
      event = await billingEventRepository.createEvent({
        _id: definition.eventId,
        ...definition.data
      }, { session });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      event = await billingEventRepository.findByIdentityOrIdempotency({
        eventId: definition.eventId,
        organizationId: org._id,
        idempotencyKey: definition.idempotencyKey,
        session
      });
      duplicated = true;
    }
  }
  return { event, duplicated };
}

async function markPaidAndConsumeNonce(invoice, context, session) {
  let paid = await subscriptionLifecycle.markInvoicePaid(invoice, {
    externalRef: context.externalRef,
    subscriptionId: context.subscriptionId,
    billingEventId: context.billingEventId,
    provider: context.provider,
    createdBy: context.userId,
    session
  });
  if (paid?.metadata?.payment_nonce) {
    const metadata = { ...(paid.metadata || {}) };
    delete metadata.payment_nonce;
    metadata.payment_completed_at = new Date().toISOString();
    paid = await invoiceRepository.updateInvoice(
      paid._id,
      { metadata },
      { session }
    );
  }
  return paid;
}

async function finalizeWithinUnitOfWork(invoiceId, input, session) {
  let invoice = await invoiceRepository.findById(invoiceId, { session });
  if (!invoice) {
    throw Object.assign(new Error('Không tìm thấy hóa đơn.'), { status: 404 });
  }
  const org = await billingOrganizationRepository.findBillingOrganizationById(
    invoice.organization_id,
    { session }
  );
  if (!org) {
    throw Object.assign(new Error('Không tìm thấy tổ chức.'), { status: 404 });
  }

  if (invoice.status === 'PAID') {
    const subscription = await subscriptionLifecycle.getCurrentSubscription(
      org._id,
      { session }
    );
    invoice = await markPaidAndConsumeNonce(invoice, {
      ...input,
      externalRef: invoice.external_ref || input.externalRef,
      subscriptionId: invoice.subscription_id || subscription?._id,
      billingEventId: invoice.billing_event_id
    }, session);
    return { invoice, subscription, organization: org, duplicated: true };
  }
  if (invoice.status !== 'OPEN') {
    throw Object.assign(
      new Error(`Hóa đơn ở trạng thái ${invoice.status}, không thể thanh toán.`),
      { status: 400 }
    );
  }

  const eventResult = await findOrCreateBillingEvent(invoice, org, input, session);
  const staleBefore = new Date(Date.now() - 60 * 1000);
  const claimed = await billingEventRepository.claimForProcessing(
    eventResult.event._id,
    staleBefore,
    { session }
  );
  if (!claimed) {
    const current = await billingEventRepository.findById(
      eventResult.event._id,
      { session }
    );
    if (current?.processing_status !== 'APPLIED') {
      throw Object.assign(
        new Error('Billing event đang được xử lý, vui lòng retry.'),
        { status: 409, code: 'PAYMENT_PROCESSING' }
      );
    }
    const subscription = await subscriptionLifecycle.getCurrentSubscription(
      org._id,
      { session }
    );
    invoice = await markPaidAndConsumeNonce(invoice, {
      ...input,
      externalRef: current.external_ref || input.externalRef,
      subscriptionId: invoice.subscription_id || subscription?._id,
      billingEventId: current._id
    }, session);
    return {
      invoice,
      event: current,
      subscription,
      organization: org,
      duplicated: true
    };
  }

  const result = await subscriptionLifecycle.applyBillingEventToSubscription(
    org,
    claimed,
    { session }
  );
  await billingEventRepository.markApplied(claimed._id, { session });
  invoice = await markPaidAndConsumeNonce(invoice, {
    ...input,
    externalRef: claimed.external_ref || input.externalRef,
    subscriptionId: result.subscription?._id,
    billingEventId: claimed._id
  }, session);

  await eventBus.publish({
    type: EVENT_TYPES.PAYMENT_SUCCEEDED,
    event_key: `payment-succeeded:${claimed._id}`,
    aggregate_type: 'OrganizationBillingEvent',
    aggregate_id: claimed._id,
    organization_id: org._id,
    actor_user_id: input.userId,
    payload: {
      invoice_id: String(invoice._id),
      billing_event_id: String(claimed._id),
      subscription_id: result.subscription?._id
        ? String(result.subscription._id)
        : null,
      amount: invoice.amount,
      provider: input.provider,
      plan: claimed.plan
    }
  }, { session });

  if (input.userId && !eventResult.duplicated) {
    await activityLogRepository.recordActivity({
      user_id: input.userId,
      action: 'SUBSCRIPTION_PAYMENT',
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name,
      details: {
        message: 'Thanh toán gói thành công — kích hoạt/gia hạn subscription',
        plan: claimed.plan,
        amount: invoice.amount,
        provider: input.provider,
        invoice_number: invoice.invoice_number,
        invoice_id: String(invoice._id),
        subscription_id: result.subscription?._id
          ? String(result.subscription._id)
          : null
      },
      ip_address: '',
      organization_id: org._id
    }, { session });
  }

  return {
    invoice,
    event: claimed,
    subscription: result.subscription,
    organization: result.organization,
    duplicated: eventResult.duplicated || Boolean(result.duplicated)
  };
}

async function finalizeSuccessfulPayment(input, options = {}) {
  const invoiceId = input.invoiceId || input.invoice?._id || input.invoice?.id;
  if (!invoiceId) {
    throw Object.assign(new Error('Không tìm thấy hóa đơn.'), { status: 404 });
  }
  const normalized = {
    externalRef: input.externalRef || '',
    provider: String(input.provider || 'MANUAL').toUpperCase(),
    userId: input.userId || null,
    note: input.note || ''
  };
  return runBillingCommand(
    (session) => finalizeWithinUnitOfWork(invoiceId, normalized, session),
    options
  );
}

module.exports = {
  finalizeSuccessfulPayment,
  finalizeWithinUnitOfWork,
  paymentEventInput
};
