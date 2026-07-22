const Plan = require('../models/Plan');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function listCatalog({ activeOnly = false } = {}) {
  return Plan.find(activeOnly ? { is_active: true } : {})
    .sort({ sort_order: 1, code: 1 })
    .lean();
}

async function listAudienceFields() {
  return Plan.find({})
    .select('code is_personal is_organization show_on_landing')
    .lean();
}

async function insertMissingDefaults(plans) {
  if (!plans.length) return [];
  const created = await Plan.insertMany(plans);
  return created.map(toDto);
}

async function updatePlanByCode(code, changes) {
  return Plan.findOneAndUpdate(
    { code },
    { $set: changes },
    { returnDocument: 'after' }
  ).lean();
}

async function backfillAudienceFlags() {
  await Plan.updateMany(
    { show_on_landing: { $exists: false } },
    { $set: { show_on_landing: true } }
  );
  await Plan.updateMany(
    { is_organization: { $exists: false }, is_personal: { $ne: true } },
    { $set: { is_organization: true } }
  );
  await Plan.updateMany(
    { is_organization: { $exists: false }, is_personal: true },
    { $set: { is_organization: false } }
  );
}

async function createCatalogPlan(input) {
  const existing = await Plan.findOne({ code: String(input.code || '').toUpperCase() })
    .select('_id')
    .lean();
  if (existing) {
    throw Object.assign(new Error('Mã gói đã tồn tại.'), { code: 11000 });
  }
  return toDto(await Plan.create(input));
}

async function findCatalogPlanById(planId) {
  return Plan.findById(planId).lean();
}

async function updateCatalogPlan(planId, changes) {
  return Plan.findByIdAndUpdate(
    planId,
    { $set: changes },
    { returnDocument: 'after', runValidators: true }
  ).lean();
}

async function deleteCatalogPlan(planId) {
  return Plan.deleteOne({ _id: planId });
}

module.exports = {
  listCatalog,
  listAudienceFields,
  insertMissingDefaults,
  updatePlanByCode,
  backfillAudienceFlags,
  createCatalogPlan,
  findCatalogPlanById,
  updateCatalogPlan,
  deleteCatalogPlan
};
