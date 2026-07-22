const invoiceRepository = require('../../repositories/invoiceRepository');
const billingEventRepository = require('../../repositories/billingEventRepository');
const billingOrganizationRepository = require('../../repositories/billingOrganizationRepository');
const billingUserRepository = require('../../repositories/billingUserRepository');
const personalPaymentRepository = require('../../repositories/personalPaymentRepository');
const activityLogRepository = require('../../repositories/activityLogRepository');
const { getPlanPeriodDays } = require('../../config/planPricing');
const { runBillingCommand } = require('./runBillingCommand');

async function findOrganization(organizationId, options = {}) {
  return billingOrganizationRepository.findBillingOrganizationById(
    organizationId,
    options
  );
}

async function getOrganizationBillingData(organizationId) {
  const [organization, invoices, events] = await Promise.all([
    findOrganization(organizationId),
    invoiceRepository.listRecentForOrganization(organizationId, 20),
    billingEventRepository.listRecentForOrganization(organizationId, 20)
  ]);
  return { organization, invoices, events };
}

async function findPersonalBillingUser(userId, options = {}) {
  return billingUserRepository.findPersonalPlanById(userId, options);
}

async function listPersonalInvoices(userId) {
  const rows = await invoiceRepository.listPersonalForUser(userId, 30);
  return rows.map((invoice) => ({
    id: String(invoice._id),
    invoice_number: invoice.invoice_number,
    status: invoice.status,
    plan: invoice.plan || invoice.metadata?.plan || '',
    amount: invoice.amount || 0,
    currency: invoice.currency || 'VND',
    paid_at: invoice.paid_at || null,
    created_at: invoice.createdAt || null,
    note: invoice.note || ''
  }));
}

async function findInvoice(invoiceId, options = {}) {
  return invoiceRepository.findById(invoiceId, options);
}

async function updateOrganizationContact(organizationId, changes, options = {}) {
  return billingOrganizationRepository.updateBillingState(
    organizationId,
    changes,
    options
  );
}

async function recordActivity(input, options = {}) {
  return activityLogRepository.recordActivity(input, options);
}

async function fulfillDirectPersonalPayment(input, options = {}) {
  return runBillingCommand(async (session) => {
    const paymentId = input.transactionId;
    let personalPayment = await personalPaymentRepository.findById(
      paymentId,
      { session }
    );
    if (!personalPayment) {
      try {
        personalPayment = await personalPaymentRepository.createPayment({
          _id: paymentId,
          user_id: input.userId,
          plan: input.plan,
          months: input.months,
          amount: input.amount,
          currency: 'VND',
          purpose: 'UPGRADE',
          status: 'PROCESSING',
          token: `direct-${input.idempotencyKey}`,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          bank_user_id: input.bankUserId,
          bank_tx_id: paymentId
        }, { session });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        personalPayment = await personalPaymentRepository.findById(
          paymentId,
          { session }
        );
      }
    }

    let user = await billingUserRepository.findBillingUserById(
      input.userId,
      { session }
    );
    if (!user) {
      throw Object.assign(new Error('Không tìm thấy người dùng.'), {
        status: 404
      });
    }
    const fulfillmentKey = String(personalPayment._id);
    if (!user.personal_payment_fulfillments?.includes(fulfillmentKey)) {
      const periodDays = getPlanPeriodDays(input.plan) * input.months;
      const base = user.plan === input.plan &&
        user.plan_expires_at &&
        new Date(user.plan_expires_at) > new Date()
        ? new Date(user.plan_expires_at)
        : new Date();
      base.setDate(base.getDate() + periodDays);
      user = await billingUserRepository.fulfillPersonalPlan(
        user._id,
        {
          plan: input.plan,
          planExpiresAt: base,
          fulfillmentKey
        },
        { session }
      ) || await billingUserRepository.findBillingUserById(
        input.userId,
        { session }
      );
    }

    personalPayment = await personalPaymentRepository.updatePayment(
      personalPayment._id,
      {
        status: 'PAID',
        paid_at: personalPayment.paid_at || new Date(),
        fulfillment_error: ''
      },
      { session }
    );
    const {
      createPersonalUpgradeInvoice
    } = require('../../services/personalPaymentService');
    await createPersonalUpgradeInvoice(personalPayment, user, { session });
    await activityLogRepository.recordActivity({
      user_id: user._id,
      action: 'PERSONAL_PLAN_UPGRADE',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      details: {
        plan: input.plan,
        months: input.months,
        amount: input.amount,
        wallet_tx: String(paymentId)
      },
      ip_address: input.ip || ''
    }, { session });

    return { user, personalPayment };
  }, options);
}

module.exports = {
  findOrganization,
  getOrganizationBillingData,
  findPersonalBillingUser,
  listPersonalInvoices,
  findInvoice,
  updateOrganizationContact,
  recordActivity,
  fulfillDirectPersonalPayment
};
