const mongoose = require('mongoose');
const Organization = require('../../models/Organization');
const Invoice = require('../../models/Invoice');
const Subscription = require('../../models/Subscription');
const OrganizationBillingEvent = require('../../models/OrganizationBillingEvent');
const Payment = require('../../models/Payment');
const Receipt = require('../../models/Receipt');
const DomainEvent = require('../../models/DomainEvent');
const Plan = require('../../models/Plan');
const activityLogRepository = require('../../repositories/activityLogRepository');
const {
  finalizeSuccessfulPayment
} = require('../../application/billing/finalizeSuccessfulPayment');

describe('FinalizeSuccessfulPayment — transaction rollback', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.TEST_MONGO_REPLICA_URI);
    }
  });

  test('fault injection sau mọi business write không để lại partial state', async () => {
    const suffix = new mongoose.Types.ObjectId().toString().slice(-8);
    await Plan.findOneAndUpdate(
      { code: 'PRO' },
      {
        $setOnInsert: {
          code: 'PRO',
          name: 'Pro',
          price_vnd: 199000,
          period_days: 30,
          is_active: true,
          is_organization: true
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    const org = await Organization.create({
      name: `Transaction Org ${suffix}`,
      slug: `transaction-org-${suffix}`,
      plan: 'FREE',
      billing_status: 'ACTIVE',
      is_active: true
    });
    const actorId = new mongoose.Types.ObjectId();
    const invoice = await Invoice.create({
      organization_id: org._id,
      invoice_number: `TX-${suffix}`,
      status: 'OPEN',
      plan: 'PRO',
      amount: 199000,
      currency: 'VND',
      period_start: new Date(),
      period_end: new Date(Date.now() + 30 * 86400000),
      idempotency_key: `transaction-${suffix}`,
      metadata: { payment_nonce: `nonce-${suffix}` },
      created_by: actorId
    });

    const fault = jest
      .spyOn(activityLogRepository, 'recordActivity')
      .mockRejectedValueOnce(new Error('FAULT_AFTER_OUTBOX'));

    await expect(finalizeSuccessfulPayment({
      invoiceId: invoice._id,
      externalRef: `provider-${suffix}`,
      provider: 'MOCK',
      userId: actorId
    })).rejects.toThrow('FAULT_AFTER_OUTBOX');
    fault.mockRestore();

    const [
      rolledBackInvoice,
      subscriptions,
      billingEvents,
      payments,
      receipts,
      outboxEvents
    ] = await Promise.all([
      Invoice.findById(invoice._id).lean(),
      Subscription.countDocuments({ organization_id: org._id }),
      OrganizationBillingEvent.countDocuments({ organization_id: org._id }),
      Payment.countDocuments({ invoice_id: invoice._id }),
      Receipt.countDocuments({ invoice_id: invoice._id }),
      DomainEvent.countDocuments({
        organization_id: org._id,
        type: 'PaymentSucceeded'
      })
    ]);

    expect(rolledBackInvoice.status).toBe('OPEN');
    expect(rolledBackInvoice.metadata.payment_nonce).toBe(`nonce-${suffix}`);
    expect(subscriptions).toBe(0);
    expect(billingEvents).toBe(0);
    expect(payments).toBe(0);
    expect(receipts).toBe(0);
    expect(outboxEvents).toBe(0);
  });
});
