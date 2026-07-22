const invoiceRepository = require('../repositories/invoiceRepository');
const subscriptionRepository = require('../repositories/subscriptionRepository');
const billingRecipientRepository = require('../repositories/billingRecipientRepository');
const { sendBillingEventEmail } = require('./mailService');

async function findOrgAdminEmail(orgId) {
  const admin = await billingRecipientRepository.findActiveOrganizationAdmin(orgId);
  return admin?.email || '';
}

async function notifyPaymentSucceeded({ invoice, org }) {
  if (!invoice?._id || !org?._id) return { skipped: true };
  const claimed = await invoiceRepository.claimPaymentNotification(
    invoice._id,
    new Date(Date.now() - 5 * 60 * 1000)
  );
  if (!claimed) return { duplicated: true };
  const to = await findOrgAdminEmail(org._id);
  try {
    const result = await sendBillingEventEmail({
      to,
      orgName: org.name,
      event: 'PAYMENT_SUCCEEDED',
      plan: claimed.plan,
      amount: claimed.amount
    });
    await invoiceRepository.completePaymentNotification(
      claimed._id,
      !result?.skipped
    );
    return result;
  } catch (error) {
    await invoiceRepository.completePaymentNotification(claimed._id, false);
    throw error;
  }
}

async function notifySubscriptionExpired({ subscription, org }) {
  if (!subscription?._id || !org?._id) return { skipped: true };
  const claimed = await subscriptionRepository.claimExpiryNotification(
    subscription._id,
    new Date(Date.now() - 5 * 60 * 1000)
  );
  if (!claimed) return { duplicated: true };
  const to = await findOrgAdminEmail(org._id);
  try {
    const result = await sendBillingEventEmail({
      to,
      orgName: org.name,
      event: 'SUBSCRIPTION_EXPIRED',
      plan: claimed.plan,
      expiresAt: claimed.current_period_end
    });
    await subscriptionRepository.completeExpiryNotification(
      claimed._id,
      !result?.skipped
    );
    return result;
  } catch (error) {
    await subscriptionRepository.completeExpiryNotification(claimed._id, false);
    throw error;
  }
}

module.exports = {
  notifyPaymentSucceeded,
  notifySubscriptionExpired
};
