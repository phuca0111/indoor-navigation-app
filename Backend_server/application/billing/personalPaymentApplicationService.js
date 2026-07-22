const personalPaymentRepository = require('../../repositories/personalPaymentRepository');
const { revokeAll } = require('../identity/sessionApplicationService');
const billingUserRepository = require('../../repositories/billingUserRepository');
const activityLogRepository = require('../../repositories/activityLogRepository');
const { getPlanPeriodDays } = require('../../config/planPricing');
const { runBillingCommand } = require('./runBillingCommand');

async function finalizePersonalUpgrade(input, options = {}) {
  return runBillingCommand(async (session) => {
    let payment = await personalPaymentRepository.findById(
      input.paymentId,
      { session }
    );
    let user = await billingUserRepository.findBillingUserById(
      payment.user_id,
      { session }
    );
    if (!user) {
      throw Object.assign(new Error('Không tìm thấy người dùng.'), {
        status: 404
      });
    }

    const periodDays = getPlanPeriodDays(input.plan) * payment.months;
    const base = user.plan === input.plan &&
      user.plan_expires_at &&
      new Date(user.plan_expires_at) > new Date()
      ? new Date(user.plan_expires_at)
      : new Date();
    base.setDate(base.getDate() + periodDays);
    user = await billingUserRepository.updateBillingUser(user._id, {
      plan: input.plan,
      plan_expires_at: base
    }, { session });
    payment = await personalPaymentRepository.updatePayment(payment._id, {
      status: 'PAID',
      paid_at: payment.paid_at || new Date(),
      bank_user_id: input.bankUserId,
      bank_tx_id: input.bankTransactionId,
      fulfillment_error: ''
    }, { session });

    const {
      createPersonalUpgradeInvoice
    } = require('../../services/personalPaymentService');
    await createPersonalUpgradeInvoice(payment, user, { session });
    await activityLogRepository.recordActivity({
      user_id: user._id,
      action: 'PERSONAL_PLAN_UPGRADE',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      details: {
        plan: input.plan,
        months: payment.months,
        amount: payment.amount,
        via: 'QR',
        payment_id: String(payment._id),
        wallet_tx: String(input.bankTransactionId || '')
      },
      ip_address: ''
    }, { session });
    return { payment, user };
  }, options);
}

async function finalizeCreateOrganizationPayment(input, options = {}) {
  return runBillingCommand(async (session) => {
    let payment = await personalPaymentRepository.findById(
      input.paymentId,
      { session }
    );
    const user = await billingUserRepository.findBillingUserById(
      payment.user_id,
      { session }
    );
    if (!user) {
      throw Object.assign(new Error('Không tìm thấy người dùng.'), {
        status: 404
      });
    }
    if (user.organization_id) {
      throw Object.assign(new Error('Tài khoản đã thuộc một tổ chức.'), {
        status: 400,
        code: 'ALREADY_IN_ORG'
      });
    }

    const {
      createOrganizationForUser
    } = require('../organization/createOrganizationForUser');
    const { org } = await createOrganizationForUser({
      userId: user._id,
      name: payment.org_meta?.name,
      slug: payment.org_meta?.slug,
      plan: input.plan,
      activatePaid: false,
      source: 'PAID_CHECKOUT',
      ip: ''
    }, { session });
    await revokeAll(user._id, {
      actorUserId: user._id,
      ipAddress: ''
    }, 'SESSION_REVOKED', { session });
    const {
      activateOrRenewSubscription
    } = require('./subscriptionApplicationService');
    await activateOrRenewSubscription({
      org,
      plan: input.plan,
      amount: payment.amount,
      currency: payment.currency || 'VND',
      provider: 'TPTPPAY',
      externalRef: `TPTP-personal-${payment._id}`,
      idempotencyKey: `create-org-${payment._id}`,
      note: 'Tạo tổ chức + kích hoạt gói qua ví TPTPbank',
      createdBy: user._id,
      metadata: {
        source: 'CREATE_ORG_QR',
        payment_id: String(payment._id),
        provider: 'TPTPPAY'
      }
    }, { session });
    payment = await personalPaymentRepository.updatePayment(payment._id, {
      status: 'PAID',
      paid_at: payment.paid_at || new Date(),
      bank_user_id: input.bankUserId,
      bank_tx_id: input.bankTransactionId,
      org_id_created: org._id,
      fulfillment_error: ''
    }, { session });
    return { payment, user, organization: org };
  }, options);
}

module.exports = {
  finalizePersonalUpgrade,
  finalizeCreateOrganizationPayment
};
