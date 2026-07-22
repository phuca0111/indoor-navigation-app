const Building = require('../models/Building');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Place = require('../models/Place');
const Floor = require('../models/Floor');
const Invoice = require('../models/Invoice');
const CmsArticle = require('../models/CmsArticle');
const LandingMedia = require('../models/LandingMedia');
const { roleHasPermission, P } = require('../utils/permissions');
const SEARCH_TYPES = [
  'organization', 'building', 'user', 'place', 'floor', 'room', 'poi',
  'invoice', 'article', 'media'
];

function safeRegex(value) {
  return new RegExp(String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    return Number.isSafeInteger(value.offset) && value.offset >= 0 ? value.offset : 0;
  } catch {
    const error = new Error('Cursor tìm kiếm không hợp lệ.');
    error.status = 400;
    throw error;
  }
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

function normalizeSearchTypes(types) {
  if (!Array.isArray(types) || !types.length) return SEARCH_TYPES;
  return [...new Set(types.map((item) => String(item).trim().toLowerCase()))]
    .filter((item) => SEARCH_TYPES.includes(item));
}

class SearchProvider {
  async search() {
    throw new Error('SearchProvider.search() chưa được triển khai.');
  }
}

class MongoSearchProvider extends SearchProvider {
  async search({ actor, query, limit = 20, cursor, types }) {
    const regex = safeRegex(query.slice(0, 80));
    const user = await User.findById(actor.userId)
      .select('organization_id assigned_buildings role')
      .lean();
    const allowedTypes = new Set(normalizeSearchTypes(types));
    const buildingScope = await this.buildingScope(actor, user);
    const tasks = [];
    const add = (type, promise, mapper) => {
      if (allowedTypes.has(type)) tasks.push(promise.then((rows) => rows.map((row) => mapper(row))));
    };

    if (['SUPER_ADMIN', 'FINANCE_ADMIN'].includes(actor.role)) {
      add('organization', Organization.find({ $or: [{ name: regex }, { slug: regex }] })
        .select('name slug plan').limit(50).lean(), (item) => ({
        type: 'organization', id: String(item._id), label: item.name,
        detail: `${item.slug} · ${item.plan}`, tab: 'organizations'
      }));
    }

    const buildingFilter = {
      is_active: { $ne: false },
      $or: [{ name: regex }, { address: regex }, { description: regex }],
      ...(buildingScope === null ? {} : { _id: { $in: buildingScope } })
    };
    add('building', Building.find(buildingFilter).select('name address status organization_id place_id')
      .limit(50).lean(), (item) => ({
      type: 'building', id: String(item._id), label: item.name,
      detail: item.address || item.status, tab: 'buildings'
    }));

    if (['SUPER_ADMIN', 'ORG_ADMIN'].includes(actor.role)) {
      const userFilter = {
        is_active: { $ne: false },
        $or: [{ email: regex }, { full_name: regex }, { phone: regex }]
      };
      if (actor.role === 'ORG_ADMIN') userFilter.organization_id = user?.organization_id;
      add('user', User.find(userFilter).select('email full_name role organization_id').limit(50).lean(), (item) => ({
        type: 'user', id: String(item._id), label: item.full_name || item.email,
        detail: `${item.email} · ${item.role}`, tab: 'users'
      }));
    }

    let placeFilter = null;
    if (actor.role === 'SUPER_ADMIN') {
      placeFilter = { status: 'ACTIVE' };
    } else if (actor.role === 'ORG_ADMIN' && user?.organization_id) {
      placeFilter = { status: 'ACTIVE', owner_org_id: user.organization_id };
    } else if (['BUILDING_ADMIN', 'REGISTERED_USER'].includes(actor.role)) {
      const accessible = await Building.find({
        _id: { $in: buildingScope || [] },
        place_id: { $ne: null }
      }).select('place_id').lean();
      placeFilter = { status: 'ACTIVE', _id: { $in: accessible.map((item) => item.place_id) } };
    }
    if (placeFilter) add('place', Place.find({
      ...placeFilter,
      $or: [{ name: regex }, { aliases: regex }, { address: regex }]
    }).select('name address category verified').limit(50).lean(), (item) => ({
      type: 'place', id: String(item._id), label: item.name,
      detail: item.address || item.category, tab: 'map-governance'
    }));

    const floorScope = buildingScope === null ? {} : { building_id: { $in: buildingScope } };
    add('floor', Floor.find({
      ...floorScope,
      $or: [{ floor_name: regex }, { 'map_data.rooms.name': regex }, { 'map_data.pois.name': regex }]
    }).select('building_id floor_number floor_name map_data.rooms map_data.pois').limit(50).lean(), (item) => ({
      type: 'floor', id: String(item._id), label: item.floor_name || `Tầng ${item.floor_number}`,
      detail: `Building ${item.building_id}`, tab: 'buildings'
    }));

    if (allowedTypes.has('room') || allowedTypes.has('poi')) {
      tasks.push(Floor.find({
        ...floorScope,
        $or: [{ 'map_data.rooms.name': regex }, { 'map_data.pois.name': regex }]
      }).select('building_id floor_number floor_name map_data.rooms map_data.pois').limit(50).lean()
        .then((floors) => floors.flatMap((floor) => {
          const rows = [];
          if (allowedTypes.has('room')) {
            for (const room of floor.map_data?.rooms || []) {
              if (regex.test(String(room.name || ''))) rows.push({
                type: 'room', id: `${floor._id}:${room.id}`, label: room.name,
                detail: `${floor.floor_name || `Tầng ${floor.floor_number}`} · ${room.room_type || ''}`,
                tab: 'buildings'
              });
            }
          }
          if (allowedTypes.has('poi')) {
            for (const poi of floor.map_data?.pois || []) {
              if (regex.test(`${poi.name || ''} ${poi.description || ''}`)) rows.push({
                type: 'poi', id: `${floor._id}:${poi.id}`, label: poi.name,
                detail: `${floor.floor_name || `Tầng ${floor.floor_number}`} · ${poi.poi_type || ''}`,
                tab: 'buildings'
              });
            }
          }
          return rows;
        })));
    }

    if (['SUPER_ADMIN', 'FINANCE_ADMIN', 'ORG_ADMIN'].includes(actor.role)) {
      const invoiceFilter = {
        $or: [{ invoice_number: regex }, { external_ref: regex }, { note: regex }]
      };
      if (actor.role === 'ORG_ADMIN') invoiceFilter.organization_id = user?.organization_id;
      add('invoice', Invoice.find(invoiceFilter).select('invoice_number status amount currency organization_id')
        .limit(50).lean(), (item) => ({
        type: 'invoice', id: String(item._id), label: item.invoice_number,
        detail: `${item.status} · ${item.amount} ${item.currency}`, tab: 'finance'
      }));
    }

    if (roleHasPermission(actor.role, P.PLATFORM_CMS_MANAGE)) {
      add('article', CmsArticle.find({
        $or: [{ title: regex }, { slug: regex }, { excerpt: regex }]
      }).select('title slug type status').limit(50).lean(), (item) => ({
        type: 'article', id: String(item._id), label: item.title,
        detail: `${item.type} · ${item.status}`, tab: 'website', websiteSub: 'articles'
      }));
      add('media', LandingMedia.find({
        status: { $nin: ['DELETED', 'PURGED'] },
        $or: [{ name: regex }, { alt: regex }]
      }).select('name kind url alt').limit(50).lean(), (item) => ({
        type: 'media', id: String(item._id), label: item.name,
        detail: item.alt || item.kind, tab: 'website', websiteSub: 'media'
      }));
    }

    const rows = (await Promise.all(tasks)).flat()
      .sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
    const offset = decodeCursor(cursor);
    const items = rows.slice(offset, offset + limit);
    return {
      items,
      next_cursor: offset + limit < rows.length ? encodeCursor(offset + limit) : null
    };
  }

  async buildingScope(actor, user) {
    if (actor.role === 'SUPER_ADMIN') return null;
    if (actor.role === 'ORG_ADMIN' && user?.organization_id) {
      return (await Building.find({ organization_id: user.organization_id }).select('_id').lean())
        .map((item) => item._id);
    }
    if (actor.role === 'BUILDING_ADMIN') return user?.assigned_buildings || [];
    if (actor.role === 'REGISTERED_USER') {
      return (await Building.find({ owner_user_id: user?._id }).select('_id').lean()).map((item) => item._id);
    }
    return [];
  }
}

class OpenSearchProvider extends SearchProvider {
  async search() {
    const error = new Error('OpenSearch provider đã có contract nhưng chưa cấu hình endpoint/credentials.');
    error.code = 'OPENSEARCH_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
}

function createSearchProvider(name = process.env.SEARCH_PROVIDER || 'mongo') {
  const selected = String(name).toLowerCase();
  if (selected === 'mongo') return new MongoSearchProvider();
  if (selected === 'opensearch') return new OpenSearchProvider();
  throw new Error(`SEARCH_PROVIDER không hỗ trợ: ${selected}`);
}

module.exports = {
  SearchProvider,
  MongoSearchProvider,
  OpenSearchProvider,
  createSearchProvider,
  safeRegex,
  decodeCursor,
  encodeCursor,
  normalizeSearchTypes
};
