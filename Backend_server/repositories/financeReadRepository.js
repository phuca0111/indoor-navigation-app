/**
 * Finance read repository — aggregations and list queries return plain DTOs.
 */
const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const ExpenseLedger = require('../models/ExpenseLedger');
const LedgerEntry = require('../models/LedgerEntry');
const Organization = require('../models/Organization');

async function aggregateInvoices(pipeline) {
  return Invoice.aggregate(pipeline);
}

async function aggregateExpenses(pipeline) {
  return Expense.aggregate(pipeline);
}

async function aggregateExpenseLedger(pipeline) {
  return ExpenseLedger.aggregate(pipeline);
}

async function aggregatePayments(pipeline) {
  return Payment.aggregate(pipeline);
}

async function aggregateLedgerEntries(pipeline) {
  return LedgerEntry.aggregate(pipeline);
}

async function findExpenses(filter, { sort, limit } = {}) {
  let query = Expense.find(filter);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function findExpenseLedger(filter, { sort, limit } = {}) {
  let query = ExpenseLedger.find(filter);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

function applyPopulate(query, populate) {
  if (!populate) return query;
  if (typeof populate === 'string') return query.populate(populate);
  if (populate.path) {
    return query.populate(populate.path, populate.select);
  }
  return query.populate(populate);
}

async function findPayments(filter, { sort, limit, populate } = {}) {
  let query = Payment.find(filter);
  query = applyPopulate(query, populate);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function findInvoices(filter, { sort, limit, populate } = {}) {
  let query = Invoice.find(filter);
  query = applyPopulate(query, populate);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function listOrganizationsForBilling(select) {
  return Organization.find({})
    .select(select)
    .lean();
}

async function findOrganizations(filter, { select, sort, limit } = {}) {
  let query = Organization.find(filter || {});
  if (select) query = query.select(select);
  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function invoiceStatsByOrganization(orgIds) {
  if (!orgIds?.length) return [];
  return Invoice.aggregate([
    { $match: { organization_id: { $in: orgIds } } },
    {
      $group: {
        _id: '$organization_id',
        invoice_count: { $sum: 1 },
        open_count: {
          $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] }
        },
        paid_amount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'PAID'] }, '$amount', 0]
          }
        }
      }
    }
  ]);
}

module.exports = {
  aggregateInvoices,
  aggregateExpenses,
  aggregateExpenseLedger,
  aggregatePayments,
  aggregateLedgerEntries,
  findExpenses,
  findExpenseLedger,
  findPayments,
  findInvoices,
  listOrganizationsForBilling,
  findOrganizations,
  invoiceStatsByOrganization
};
