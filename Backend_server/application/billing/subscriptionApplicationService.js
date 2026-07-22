const lifecycle = require('../../services/subscriptionLifecycle');
const {
  transactionsEnabled,
  runBillingCommand
} = require('./runBillingCommand');

async function activateOrRenewSubscription(input, options = {}) {
  return runBillingCommand(
    (session) => lifecycle.activateOrRenewSubscription({ ...input, session }),
    options
  );
}

async function applyBillingEventToSubscription(org, event, options = {}) {
  return runBillingCommand(
    (session) => lifecycle.applyBillingEventToSubscription(
      org,
      event,
      { session }
    ),
    options
  );
}

async function markSubscriptionPastDue(org, input = {}, options = {}) {
  return runBillingCommand(
    (session) => lifecycle.markSubscriptionPastDue(org, { ...input, session }),
    options
  );
}

async function expireCurrentSubscription(org, input = {}, options = {}) {
  return runBillingCommand(
    (session) => lifecycle.expireCurrentSubscription(org, { ...input, session }),
    options
  );
}

async function cancelCurrentSubscription(org, input = {}, options = {}) {
  return runBillingCommand(
    (session) => lifecycle.cancelCurrentSubscription(org, { ...input, session }),
    options
  );
}

async function createOpenInvoice(input, options = {}) {
  return runBillingCommand(
    (session) => lifecycle.createOpenInvoice({ ...input, session }),
    options
  );
}

async function markInvoicePaid(invoice, input = {}, options = {}) {
  return runBillingCommand(
    (session) => lifecycle.markInvoicePaid(invoice, { ...input, session }),
    options
  );
}

module.exports = {
  transactionsEnabled,
  activateOrRenewSubscription,
  applyBillingEventToSubscription,
  markSubscriptionPastDue,
  expireCurrentSubscription,
  cancelCurrentSubscription,
  createOpenInvoice,
  markInvoicePaid,
  getCurrentSubscription: lifecycle.getCurrentSubscription,
  syncOrganizationFromSubscription: lifecycle.syncOrganizationFromSubscription,
  refreshSubscriptionStatus: lifecycle.refreshSubscriptionStatus
};
