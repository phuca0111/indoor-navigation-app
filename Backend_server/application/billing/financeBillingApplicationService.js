const planRepository = require('../../repositories/planRepository');
const invoiceRepository = require('../../repositories/invoiceRepository');
const subscriptionRepository = require('../../repositories/subscriptionRepository');
const billingOrganizationRepository = require('../../repositories/billingOrganizationRepository');
const billingRecipientRepository = require('../../repositories/billingRecipientRepository');
const activityLogRepository = require('../../repositories/activityLogRepository');
const {
  createOpenInvoice,
  markInvoicePaid
} = require('./subscriptionApplicationService');
const { listPayments } = require('../../services/paymentLedger');

async function createCatalogPlan(input) {
  return planRepository.createCatalogPlan(input);
}

async function findCatalogPlan(planId) {
  return planRepository.findCatalogPlanById(planId);
}

async function updateCatalogPlan(planId, changes) {
  return planRepository.updateCatalogPlan(planId, changes);
}

async function removeUnusedCatalogPlan(planId) {
  const plan = await planRepository.findCatalogPlanById(planId);
  if (!plan) return { plan: null, organizationCount: 0, subscriptionCount: 0 };

  const code = String(plan.code || '').toUpperCase();
  const [organizationCount, subscriptionCount] = await Promise.all([
    billingOrganizationRepository.countOrganizationsUsingPlan(code),
    subscriptionRepository.countCurrentUsingPlan(code)
  ]);
  if (organizationCount === 0 && subscriptionCount === 0) {
    await planRepository.deleteCatalogPlan(plan._id);
  }
  return { plan, organizationCount, subscriptionCount };
}

async function listBillingInvoices(query = {}) {
  return invoiceRepository.listInvoices({
    status: query.status,
    organizationId: query.organization_id,
    limit: query.limit
  });
}

async function findBillingOrganization(organizationId) {
  return billingOrganizationRepository.findBillingOrganizationById(organizationId);
}

async function createManualOpenInvoice(input) {
  return createOpenInvoice(input);
}

async function findInvoice(invoiceId) {
  return invoiceRepository.findById(invoiceId);
}

async function updateInvoice(invoiceId, changes) {
  return invoiceRepository.updateInvoice(invoiceId, changes);
}

async function voidInvoice(invoice, reason) {
  return invoiceRepository.updateInvoice(invoice._id, {
    status: 'VOID',
    note: `${invoice.note ? `${invoice.note} | ` : ''}${reason || 'Super void'}`
  });
}

async function collectInvoice(invoice, input) {
  return markInvoicePaid(invoice, input);
}

async function getInvoiceEmailContext(invoice) {
  const [organization, recipient] = await Promise.all([
    billingOrganizationRepository.findBillingOrganizationById(invoice.organization_id),
    billingRecipientRepository.findActiveOrganizationAdmin(invoice.organization_id)
  ]);
  return { organization, recipient };
}

async function listBillingPayments(filter, limit) {
  return listPayments(filter, limit);
}

async function recordActivity(input) {
  return activityLogRepository.recordActivity(input);
}

module.exports = {
  createCatalogPlan,
  findCatalogPlan,
  updateCatalogPlan,
  removeUnusedCatalogPlan,
  listBillingInvoices,
  findBillingOrganization,
  createManualOpenInvoice,
  findInvoice,
  updateInvoice,
  voidInvoice,
  collectInvoice,
  getInvoiceEmailContext,
  listBillingPayments,
  recordActivity
};
