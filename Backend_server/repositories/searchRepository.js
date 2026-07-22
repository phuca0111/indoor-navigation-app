const Building = require('../models/Building');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Place = require('../models/Place');
const Floor = require('../models/Floor');
const Invoice = require('../models/Invoice');
const CmsArticle = require('../models/CmsArticle');
const LandingMedia = require('../models/LandingMedia');
const SearchProjection = require('../models/SearchProjection');
const MigrationCheckpoint = require('../models/MigrationCheckpoint');

async function actorData(userId) {
  return User.findById(userId).select('organization_id assigned_buildings role').lean();
}

async function buildingIds(filter) {
  const rows = await Building.find(filter).select('_id').lean();
  return rows.map((row) => row._id);
}

async function placeIdsForBuildings(ids) {
  const rows = await Building.find({ _id: { $in: ids }, place_id: { $ne: null } })
    .select('place_id').lean();
  return rows.map((row) => row.place_id);
}

function limited(Model, filter, selection) {
  return Model.find(filter).select(selection).limit(50).lean();
}

const findOrganizations = (filter) => limited(Organization, filter, 'name slug plan');
const findBuildings = (filter) => limited(Building, filter, 'name address status organization_id place_id');
const findUsers = (filter) => limited(User, filter, 'email full_name role organization_id');
const findPlaces = (filter) => limited(Place, filter, 'name address category verified owner_org_id');
const findFloors = (filter) => limited(
  Floor,
  filter,
  'building_id floor_number floor_name map_data.rooms map_data.pois'
);
const findInvoices = (filter) => limited(
  Invoice,
  filter,
  'invoice_number status amount currency organization_id'
);
const findArticles = (filter) => limited(CmsArticle, filter, 'title slug type status revision');
const findMedia = (filter) => limited(LandingMedia, filter, 'name kind url alt revision');

async function upsertProjection(input) {
  return SearchProjection.findOneAndUpdate(
    { projection_key: input.projection_key },
    { $set: input },
    { upsert: true, new: true, runValidators: true }
  ).lean();
}

async function searchProjections(filter, limit = 50) {
  return SearchProjection.find(filter).sort({ type: 1, label: 1 }).limit(limit).lean();
}

async function listProjectionSources(type, afterId, limit) {
  const Model = { article: CmsArticle, media: LandingMedia }[type];
  if (!Model) return [];
  const filter = afterId ? { _id: { $gt: afterId } } : {};
  return Model.find(filter).sort({ _id: 1 }).limit(limit).lean();
}

async function findProjectionSource(type, id) {
  const Model = { article: CmsArticle, media: LandingMedia }[type];
  return Model ? Model.findById(id).lean() : null;
}

async function getCheckpoint(key) {
  return MigrationCheckpoint.findOne({ migration_key: key }).lean();
}

async function saveCheckpoint(key, update) {
  return MigrationCheckpoint.findOneAndUpdate(
    { migration_key: key },
    { $set: update },
    { upsert: true, new: true }
  ).lean();
}

module.exports = {
  actorData,
  buildingIds,
  placeIdsForBuildings,
  findOrganizations,
  findBuildings,
  findUsers,
  findPlaces,
  findFloors,
  findInvoices,
  findArticles,
  findMedia,
  upsertProjection,
  searchProjections,
  listProjectionSources,
  findProjectionSource,
  getCheckpoint,
  saveCheckpoint
};
