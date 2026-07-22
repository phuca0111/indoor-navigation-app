/**
 * Analytics read repository — returns lean DTOs / aggregation arrays only.
 */
const ActivityLog = require('../models/ActivityLog');
const Invoice = require('../models/Invoice');
const Organization = require('../models/Organization');
const OrganizationRegistration = require('../models/OrganizationRegistration');
const User = require('../models/User');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Draft = require('../models/Draft');
const MapVersion = require('../models/MapVersion');
const QrScanLog = require('../models/QrScanLog');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const OrganizationPlanHistory = require('../models/OrganizationPlanHistory');
const Expense = require('../models/Expense');
const LedgerEntry = require('../models/LedgerEntry');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const TelemetryEvent = require('../models/TelemetryEvent');

async function aggregateActivity(pipeline) {
  return ActivityLog.aggregate(pipeline);
}

async function findActivity(filter, { select } = {}) {
  let query = ActivityLog.find(filter);
  if (select) query = query.select(select);
  return query.lean();
}

async function aggregateInvoices(pipeline) {
  return Invoice.aggregate(pipeline);
}

async function distinctInvoiceField(field, filter) {
  return Invoice.distinct(field, filter);
}

async function aggregateOrganizations(pipeline) {
  return Organization.aggregate(pipeline);
}

async function findOrganizationById(id, select) {
  if (!id) return null;
  let query = Organization.findById(id);
  if (select) query = query.select(select);
  return query.lean();
}

async function findOrganizations(filter, { select, limit } = {}) {
  let query = Organization.find(filter || {});
  if (select) query = query.select(select);
  if (limit) query = query.limit(limit);
  return query.lean();
}

async function countOrganizations(filter) {
  return Organization.countDocuments(filter || {});
}

async function findUsers(filter, { select } = {}) {
  let query = User.find(filter || {});
  if (select) query = query.select(select);
  return query.lean();
}

async function findBuildingIds(filter) {
  const rows = await Building.find(filter || {}).select('_id').lean();
  return rows.map((row) => row._id);
}

async function findBuildingById(id, select) {
  if (!id) return null;
  let query = Building.findById(id);
  if (select) query = query.select(select);
  return query.lean();
}

async function findBuildings(filter, { select } = {}) {
  let query = Building.find(filter || {});
  if (select) query = query.select(select);
  return query.lean();
}

async function aggregateModel(modelName, pipeline) {
  const models = {
    Organization,
    Building,
    User,
    Floor,
    MapVersion,
    QrScanLog,
    Expense,
    LedgerEntry,
    Subscription,
    OrganizationPlanHistory,
    OrganizationRegistration,
    Draft,
    Invoice,
    ActivityLog,
    AnalyticsEvent
  };
  const Model = models[modelName];
  if (!Model) throw new Error(`Unknown analytics model: ${modelName}`);
  return Model.aggregate(pipeline);
}

async function countDocuments(modelName, filter) {
  const models = {
    Organization,
    Building,
    User,
    Floor,
    Draft,
    MapVersion,
    QrScanLog,
    Subscription,
    Plan,
    OrganizationRegistration,
    Expense,
    Invoice
  };
  const Model = models[modelName];
  if (!Model) throw new Error(`Unknown analytics model: ${modelName}`);
  return Model.countDocuments(filter || {});
}

async function findRegistrations(filter, { select } = {}) {
  let query = OrganizationRegistration.find(filter || {});
  if (select) query = query.select(select);
  return query.lean();
}

async function findPlans(filter, { select } = {}) {
  let query = Plan.find(filter || {});
  if (select) query = query.select(select);
  return query.lean();
}

async function findSubscriptions(filter, { select } = {}) {
  let query = Subscription.find(filter || {});
  if (select) query = query.select(select);
  return query.lean();
}

async function aggregateFunnel(pipeline) {
  return AnalyticsEvent.aggregate(pipeline);
}

async function telemetryByDay({
  eventType,
  start,
  end,
  orgId,
  buildingIds,
  buildingId
}) {
  const match = {
    event_type: eventType,
    occurred_at: { $gte: start, $lte: end }
  };
  if (buildingId) match.building_id = buildingId;
  else if (buildingIds?.length) match.building_id = { $in: buildingIds };
  else if (orgId) match.organization_id = orgId;

  return TelemetryEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$occurred_at',
            timezone: process.env.REPORT_TIMEZONE || 'Asia/Ho_Chi_Minh'
          }
        },
        count: { $sum: 1 }
      }
    }
  ]);
}

async function countTelemetry({ eventType, start, end, orgId, buildingIds }) {
  const match = {
    event_type: eventType,
    occurred_at: { $gte: start, $lte: end }
  };
  if (buildingIds?.length) match.building_id = { $in: buildingIds };
  else if (orgId) match.organization_id = orgId;
  return TelemetryEvent.countDocuments(match);
}

async function navCompleteByBuilding({ start, end, buildingIds }) {
  const match = {
    event_type: 'nav_complete',
    occurred_at: { $gte: start, $lte: end }
  };
  if (buildingIds?.length) match.building_id = { $in: buildingIds };
  return TelemetryEvent.aggregate([
    { $match: match },
    { $group: { _id: '$building_id', navigation_requests: { $sum: 1 } } }
  ]);
}

module.exports = {
  aggregateActivity,
  findActivity,
  aggregateInvoices,
  distinctInvoiceField,
  aggregateOrganizations,
  findOrganizationById,
  findOrganizations,
  countOrganizations,
  findUsers,
  findBuildingIds,
  findBuildingById,
  findBuildings,
  aggregateModel,
  countDocuments,
  findRegistrations,
  findPlans,
  findSubscriptions,
  aggregateFunnel,
  telemetryByDay,
  countTelemetry,
  navCompleteByBuilding
};
