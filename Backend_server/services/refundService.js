const gateways = require('./paymentGateways');
const eventBus = require('../shared/events/eventBus');
const EVENT_TYPES = require('../shared/events/eventTypes');
const refundRepository = require('../repositories/refundRepository');
const paymentRepository = require('../repositories/paymentRepository');
const invoiceRepository = require('../repositories/invoiceRepository');
const subscriptionRepository = require('../repositories/subscriptionRepository');
const billingOrganizationRepository = require('../repositories/billingOrganizationRepository');
const billingEventRepository = require('../repositories/billingEventRepository');
const activityLogRepository = require('../repositories/activityLogRepository');
const { runBillingCommand } = require('../application/billing/runBillingCommand');

function deterministicRefundLedgerId(paymentId) {
  return paymentRepository.deterministicPaymentId('payment-refund', paymentId);
}

async function createRefundLedger(payment, refund, opts) {
  const idempotencyKey = `refund-${payment._id}`;
  let ledger = await paymentRepository.findByIdempotencyKey(
    idempotencyKey,
    { session: opts.session }
  );
  if (!ledger) {
    try {
      ledger = await paymentRepository.createPayment({
        _id: deterministicRefundLedgerId(payment._id),
        organization_id: payment.organization_id,
        invoice_id: payment.invoice_id,
        amount: -Math.abs(Number(refund.amount)),
        currency: payment.currency || 'VND',
        method: payment.method || 'OTHER',
        status: 'REFUNDED',
        paid_at: refund.completed_at || new Date(),
        external_ref: refund.provider_refund_id || opts.external_ref || '',
        note: refund.reason || `Hoàn tiền cho ${payment.idempotency_key || payment._id}`,
        idempotency_key: idempotencyKey,
        metadata: {
          refund_of: String(payment._id),
          refund_id: String(refund._id),
          provider_status: refund.provider_status,
          invoice_number: payment.metadata?.invoice_number || '',
          plan: payment.metadata?.plan || ''
        },
        created_by: opts.created_by || null
      }, { session: opts.session });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      ledger = await paymentRepository.findByIdentityOrIdempotency({
        paymentId: deterministicRefundLedgerId(payment._id),
        idempotencyKey,
        session: opts.session
      });
    }
  }
  const paymentMetadata = {
    ...(payment.metadata || {}),
    refund_id: String(refund._id),
    refund_ledger_id: String(ledger._id),
    refunded_at: refund.completed_at || new Date(),
    provider_refund_id: refund.provider_refund_id
  };
  await paymentRepository.updatePayment(payment._id, {
    status: 'REFUNDED',
    metadata: paymentMetadata
  }, { session: opts.session });
  payment.status = 'REFUNDED';
  payment.metadata = paymentMetadata;
  return ledger;
}

async function recordBillingRefund(payment, refund, invoice, opts) {
  if (!payment.organization_id) return null;
  const key = `payment-refunded-${payment._id}`;
  return billingEventRepository.recordRefundIfAbsent(
    { organization_id: payment.organization_id, idempotency_key: key },
    {
      event_type: 'PAYMENT_REFUNDED',
      payment_status: 'REFUNDED',
      plan: invoice?.plan || payment.metadata?.plan || null,
      amount: -Math.abs(Number(refund.amount)),
      currency: refund.currency,
      period_start_at: invoice?.period_start || null,
      period_end_at: invoice?.period_end || null,
      external_ref: refund.provider_refund_id || '',
      processing_status: 'APPLIED',
      processed_at: new Date(),
      note: refund.reason,
      metadata: {
        payment_id: String(payment._id),
        refund_id: String(refund._id),
        invoice_id: invoice?._id ? String(invoice._id) : null
      },
      created_by: opts.created_by || null
    },
    { session: opts.session }
  );
}

async function revokeRefundedEntitlement(payment, invoice, opts) {
  if (!invoice?.subscription_id || !payment.organization_id) {
    return { revoked: false, reason: 'NO_LINKED_SUBSCRIPTION' };
  }
  const current = await subscriptionRepository.findCurrentByOrganization(
    payment.organization_id,
    { session: opts.session }
  );
  if (!current || String(current._id) !== String(invoice.subscription_id)) {
    return { revoked: false, reason: 'SUBSCRIPTION_NOT_CURRENT' };
  }
  const laterPaidInvoice = await invoiceRepository.existsLaterPaidInvoice({
    organizationId: payment.organization_id,
    excludedInvoiceId: invoice._id,
    paidAfter: invoice.paid_at || payment.paid_at || new Date(0),
    session: opts.session
  });
  if (laterPaidInvoice) {
    return { revoked: false, reason: 'LATER_PAYMENT_EXISTS' };
  }
  const org = await billingOrganizationRepository.findBillingOrganizationById(
    payment.organization_id,
    { session: opts.session }
  );
  if (!org) return { revoked: false, reason: 'ORGANIZATION_NOT_FOUND' };
  const {
    expireCurrentSubscription
  } = require('../application/billing/subscriptionApplicationService');
  await expireCurrentSubscription(org, {
    createdBy: opts.created_by || null,
    source: 'REFUND',
    note: `Thu hồi quyền lợi do hoàn tiền ${payment._id}`
  }, { session: opts.session });
  return { revoked: true };
}

async function finalizeRefundWithinUnitOfWork(payment, refund, opts) {
  const invoice = payment.invoice_id
    ? await invoiceRepository.findById(payment.invoice_id, { session: opts.session })
    : null;
  const ledger = await createRefundLedger(payment, refund, opts);
  const { postBusinessEvent } = require('./unifiedLedger');
  await postBusinessEvent('REFUND', refund, {
    source_type: 'REFUND',
    posting_key: `refund:${refund._id}`,
    amount: refund.amount,
    currency: refund.currency,
    occurred_at: refund.completed_at || new Date(),
    organization_id: payment.organization_id,
    created_by: opts.created_by,
    metadata: { payment_id: String(payment._id), invoice_id: payment.invoice_id ? String(payment.invoice_id) : null },
    deps: opts.session ? { session: opts.session } : undefined
  });
  await recordBillingRefund(payment, refund, invoice, opts);
  const entitlement = await revokeRefundedEntitlement(payment, invoice, opts);
  await eventBus.publish({
    type: EVENT_TYPES.REFUND_COMPLETED,
    event_key: `refund-completed:${refund._id}`,
    aggregate_type: 'Refund',
    aggregate_id: refund._id,
    organization_id: payment.organization_id,
    actor_user_id: opts.created_by || null,
    payload: {
      refund_id: String(refund._id),
      payment_id: String(payment._id),
      invoice_id: invoice?._id ? String(invoice._id) : null,
      amount: refund.amount,
      provider: refund.provider,
      entitlement_revoked: entitlement.revoked
    }
  }, { session: opts.session });
  if (opts.created_by) {
    await activityLogRepository.recordActivity({
      user_id: opts.created_by,
      action: 'REFUND_PAYMENT',
      target_type: 'payment',
      target_id: String(payment._id),
      target: payment.metadata?.invoice_number || String(payment._id),
      details: {
        message: 'Hoàn tiền thành công',
        refund_id: String(refund._id),
        amount: refund.amount,
        provider: refund.provider,
        provider_refund_id: refund.provider_refund_id,
        entitlement
      },
      organization_id: payment.organization_id || null
    }, { session: opts.session });
  }
  return ledger;
}

async function finalizeRefund(payment, refund, opts = {}) {
  return runBillingCommand(
    (session) => finalizeRefundWithinUnitOfWork(
      payment,
      refund,
      { ...opts, session }
    ),
    opts
  );
}

async function refundPayment(paymentId, opts = {}) {
  const payment = await paymentRepository.findById(paymentId);
  if (!payment) {
    throw Object.assign(new Error('Không tìm thấy khoản thanh toán.'), { status: 404 });
  }
  const idempotencyKey = String(opts.idempotency_key || `refund-${payment._id}`);
  let refund = await refundRepository.findByIdempotencyKey(idempotencyKey);
  if (!refund) {
    if (payment.status !== 'SUCCESS') {
      throw Object.assign(new Error('Chỉ hoàn được khoản thanh toán SUCCESS.'), {
        status: 400,
        code: 'PAYMENT_NOT_REFUNDABLE'
      });
    }
    refund = await refundRepository.createIfAbsent(idempotencyKey, {
      payment_id: payment._id,
      invoice_id: payment.invoice_id,
      organization_id: payment.organization_id,
      provider: payment.method,
      amount: Math.abs(Number(payment.amount)),
      currency: payment.currency || 'VND',
      status: 'REQUESTED',
      requested_by: opts.created_by || null,
      reason: opts.note || '',
      provider_refund_id: opts.external_ref || ''
    });
  }
  if (refund.status === 'COMPLETED') {
    const ledger = await finalizeRefund(payment, refund, opts);
    return { payment, refund: ledger, refund_request: refund, duplicated: true };
  }
  const claimed = await refundRepository.claimForProcessing(refund._id);
  if (!claimed) {
    throw Object.assign(new Error('Yêu cầu hoàn tiền đang được xử lý.'), {
      status: 409,
      code: 'REFUND_PROCESSING'
    });
  }

  try {
    const invoice = payment.invoice_id
      ? await invoiceRepository.findById(payment.invoice_id)
      : null;
    const result = await gateways.forPayment(payment).applyRefund({
      refund: claimed,
      payment,
      invoice,
      ipAddr: opts.ip || '127.0.0.1'
    });
    const status = result.status === 'COMPLETED' ? 'COMPLETED' : 'GATEWAY_PENDING';
    const updatedClaim = await refundRepository.updateProcessingResult(claimed._id, {
      status,
      provider_refund_id: result.provider_refund_id || claimed.provider_refund_id,
      provider_status: result.provider_status || '',
      provider_response: result.response || {},
      completed_at: status === 'COMPLETED' ? new Date() : null
    });
    if (updatedClaim.status !== 'COMPLETED') {
      return { payment, refund: null, refund_request: updatedClaim, duplicated: false };
    }
    const ledger = await finalizeRefund(payment, updatedClaim, opts);
    return { payment, refund: ledger, refund_request: updatedClaim, duplicated: false };
  } catch (error) {
    await refundRepository.updateProcessingResult(claimed._id, {
      status: error?.name === 'TimeoutError' ? 'GATEWAY_PENDING' : 'FAILED',
      last_error: String(error.message || error).slice(0, 1000),
      provider_response: error.providerResponse || claimed.provider_response || {}
    });
    throw error;
  }
}

module.exports = {
  refundPayment,
  finalizeRefund,
  finalizeRefundWithinUnitOfWork
};
