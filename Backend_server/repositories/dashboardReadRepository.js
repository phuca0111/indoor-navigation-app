/**
 * Dashboard overview read repository — DTO-only results.
 */
const Organization = require('../models/Organization');
const OrganizationPlanHistory = require('../models/OrganizationPlanHistory');
const User = require('../models/User');
const OrganizationRegistration = require('../models/OrganizationRegistration');
const ActivityLog = require('../models/ActivityLog');
const QrScanLog = require('../models/QrScanLog');
const PersonalPayment = require('../models/PersonalPayment');
const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const OrganizationBillingEvent = require('../models/OrganizationBillingEvent');
const Building = require('../models/Building');

async function countOrganizations(filter) {
  return Organization.countDocuments(filter || {});
}

async function findOrganizationById(id) {
  if (!id) return null;
  return Organization.findById(id).lean();
}

async function aggregateOrganizations(pipeline) {
  return Organization.aggregate(pipeline);
}

async function findOrganizations(filter, { select, sort, limit } = {}) {
  let query = Organization.find(filter || {});
  if (select) query = query.select(select);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function aggregatePlanHistory(pipeline) {
  return OrganizationPlanHistory.aggregate(pipeline);
}

async function findPlanHistory(filter, { select, sort, limit } = {}) {
  let query = OrganizationPlanHistory.find(filter || {});
  if (select) query = query.select(select);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function countUsers(filter) {
  return User.countDocuments(filter || {});
}

async function findUsers(filter, { select, sort, limit } = {}) {
  let query = User.find(filter || {});
  if (select) query = query.select(select);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function countRegistrations(filter) {
  return OrganizationRegistration.countDocuments(filter || {});
}

async function findActivity(filter, {
  select,
  sort,
  limit,
  populate
} = {}) {
  let query = ActivityLog.find(filter || {});
  if (select) query = query.select(select);
  if (populate) {
    if (typeof populate === 'string') query = query.populate(populate);
    else query = query.populate(populate.path, populate.select);
  }
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function aggregateQrScans(pipeline) {
  return QrScanLog.aggregate(pipeline);
}

async function countQrScans(filter) {
  return QrScanLog.countDocuments(filter || {});
}

async function aggregatePersonalPayments(pipeline) {
  return PersonalPayment.aggregate(pipeline);
}

async function aggregateInvoices(pipeline) {
  return Invoice.aggregate(pipeline);
}

async function findInvoices(filter, { select, sort, limit } = {}) {
  let query = Invoice.find(filter || {});
  if (select) query = query.select(select);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function aggregateExpenses(pipeline) {
  return Expense.aggregate(pipeline);
}

async function findBillingEvents(filter, { select, sort, limit } = {}) {
  let query = OrganizationBillingEvent.find(filter || {});
  if (select) query = query.select(select);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function countBillingEvents(filter) {
  return OrganizationBillingEvent.countDocuments(filter || {});
}

async function findBuildings(filter, { select } = {}) {
  let query = Building.find(filter || {});
  if (select) query = query.select(select);
  return query.lean();
}

async function aggregateUsers(pipeline) {
  return User.aggregate(pipeline);
}

async function aggregateActivity(pipeline) {
  return ActivityLog.aggregate(pipeline);
}

async function distinctQrScans(field, filter) {
  return QrScanLog.distinct(field, filter || {});
}

async function countPlanHistory(filter) {
  return OrganizationPlanHistory.countDocuments(filter || {});
}

async function findUserById(id, select) {
  if (!id) return null;
  let query = User.findById(id);
  if (select) query = query.select(select);
  return query.lean();
}

module.exports = {
  countOrganizations,
  findOrganizationById,
  aggregateOrganizations,
  findOrganizations,
  aggregatePlanHistory,
  findPlanHistory,
  countPlanHistory,
  countUsers,
  findUsers,
  findUserById,
  aggregateUsers,
  countRegistrations,
  findActivity,
  aggregateActivity,
  aggregateQrScans,
  countQrScans,
  distinctQrScans,
  aggregatePersonalPayments,
  aggregateInvoices,
  findInvoices,
  aggregateExpenses,
  findBillingEvents,
  countBillingEvents,
  findBuildings
};
