const searchRepository = require('../../repositories/searchRepository');
const { projectionScopeFilter } = require('./searchPolicy');

function safeRegex(value) {
  return new RegExp(String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

class MongoSearchProvider {
  async search({ query, limit, offset, types, scope }) {
    const regex = safeRegex(query.slice(0, 80));
    const allowed = new Set(types);
    const tasks = [];
    const add = (type, promise, map) => {
      if (allowed.has(type)) tasks.push(promise.then((rows) => rows.map(map)));
    };
    if (scope.platform) {
      add('organization', searchRepository.findOrganizations({
        $or: [{ name: regex }, { slug: regex }]
      }), (row) => ({
        type: 'organization', id: String(row._id), label: row.name,
        detail: `${row.slug} · ${row.plan}`, tab: 'organizations'
      }));
    }
    const buildingFilter = {
      is_active: { $ne: false },
      $or: [{ name: regex }, { address: regex }, { description: regex }],
      ...(scope.buildingIds === null ? {} : { _id: { $in: scope.buildingIds } })
    };
    add('building', searchRepository.findBuildings(buildingFilter), (row) => ({
      type: 'building', id: String(row._id), label: row.name,
      detail: row.address || row.status, tab: 'buildings'
    }));
    if (allowed.has('user')) {
      const filter = {
        is_active: { $ne: false },
        $or: [{ email: regex }, { full_name: regex }, { phone: regex }],
        ...(scope.platform ? {} : { organization_id: scope.organizationId })
      };
      add('user', searchRepository.findUsers(filter), (row) => ({
        type: 'user', id: String(row._id), label: row.full_name || row.email,
        detail: `${row.email} · ${row.role}`, tab: 'users'
      }));
    }
    if (allowed.has('place')) {
      const placeFilter = scope.platform
        ? { status: 'ACTIVE' }
        : scope.organizationId
          ? { status: 'ACTIVE', owner_org_id: scope.organizationId }
          : {
              status: 'ACTIVE',
              _id: { $in: await searchRepository.placeIdsForBuildings(scope.buildingIds || []) }
            };
      add('place', searchRepository.findPlaces({
        ...placeFilter,
        $or: [{ name: regex }, { aliases: regex }, { address: regex }]
      }), (row) => ({
        type: 'place', id: String(row._id), label: row.name,
        detail: row.address || row.category, tab: 'map-governance'
      }));
    }
    const floorScope = scope.buildingIds === null
      ? {}
      : { building_id: { $in: scope.buildingIds } };
    const floorQuery = {
      ...floorScope,
      $or: [{ floor_name: regex }, { 'map_data.rooms.name': regex }, { 'map_data.pois.name': regex }]
    };
    add('floor', searchRepository.findFloors(floorQuery), (row) => ({
      type: 'floor', id: String(row._id), label: row.floor_name || `Tầng ${row.floor_number}`,
      detail: `Building ${row.building_id}`, tab: 'buildings'
    }));
    if (allowed.has('room') || allowed.has('poi')) {
      tasks.push(searchRepository.findFloors(floorQuery).then((floors) => floors.flatMap((floor) => {
        const rows = [];
        if (allowed.has('room')) {
          for (const room of floor.map_data?.rooms || []) {
            if (regex.test(String(room.name || ''))) rows.push({
              type: 'room', id: `${floor._id}:${room.id}`, label: room.name,
              detail: floor.floor_name || `Tầng ${floor.floor_number}`, tab: 'buildings'
            });
          }
        }
        if (allowed.has('poi')) {
          for (const poi of floor.map_data?.pois || []) {
            if (regex.test(`${poi.name || ''} ${poi.description || ''}`)) rows.push({
              type: 'poi', id: `${floor._id}:${poi.id}`, label: poi.name,
              detail: floor.floor_name || `Tầng ${floor.floor_number}`, tab: 'buildings'
            });
          }
        }
        return rows;
      })));
    }
    if (allowed.has('invoice')) {
      add('invoice', searchRepository.findInvoices({
        $or: [{ invoice_number: regex }, { external_ref: regex }, { note: regex }],
        ...(scope.platform ? {} : { organization_id: scope.organizationId })
      }), (row) => ({
        type: 'invoice', id: String(row._id), label: row.invoice_number,
        detail: `${row.status} · ${row.amount} ${row.currency}`, tab: 'finance'
      }));
    }
    add('article', searchRepository.findArticles({
      deleted_at: null,
      $or: [{ title: regex }, { slug: regex }, { excerpt: regex }]
    }), (row) => ({
      type: 'article', id: String(row._id), label: row.title,
      detail: `${row.type} · ${row.status}`, tab: 'website', websiteSub: 'articles'
    }));
    add('media', searchRepository.findMedia({
      status: 'ACTIVE',
      $or: [{ name: regex }, { alt: regex }]
    }), (row) => ({
      type: 'media', id: String(row._id), label: row.name,
      detail: row.alt || row.kind, tab: 'website', websiteSub: 'media'
    }));
    const rows = (await Promise.all(tasks)).flat()
      .sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
    return {
      items: rows.slice(offset, offset + limit),
      hasMore: offset + limit < rows.length
    };
  }
}

class ProjectionSearchProvider {
  async search({ query, limit, offset, types, scope }) {
    const regex = safeRegex(query.slice(0, 80));
    const rows = await searchRepository.searchProjections({
      deleted: false,
      type: { $in: types },
      search_text: regex,
      ...projectionScopeFilter(scope)
    }, offset + limit + 1);
    return {
      items: rows.slice(offset, offset + limit).map((row) => ({
        type: row.type,
        id: row.source_id,
        label: row.label,
        detail: row.detail,
        ...(row.route || {})
      })),
      hasMore: rows.length > offset + limit
    };
  }
}

class OpenSearchProvider {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.OPENSEARCH_ENDPOINT;
    this.index = options.index || process.env.OPENSEARCH_INDEX || 'indoor-nav-search';
    this.apiKey = options.apiKey || process.env.OPENSEARCH_API_KEY;
  }

  async search({ query, limit, offset, types, scope }) {
    if (!this.endpoint || !this.apiKey) {
      throw Object.assign(new Error('OpenSearch chưa cấu hình endpoint/credentials.'), {
        code: 'OPENSEARCH_NOT_CONFIGURED',
        status: 503
      });
    }
    const filters = [{ terms: { type: types } }, { term: { deleted: false } }];
    if (!scope.platform) {
      filters.push({
        bool: {
          should: [
            { term: { visibility: 'PUBLIC' } },
            ...(scope.organizationId ? [{ term: { organization_id: String(scope.organizationId) } }] : []),
            ...(scope.buildingIds?.length ? [{ terms: { building_id: scope.buildingIds.map(String) } }] : [])
          ],
          minimum_should_match: 1
        }
      });
    }
    const response = await fetch(
      `${this.endpoint.replace(/\/$/, '')}/${encodeURIComponent(this.index)}/_search`,
      {
        method: 'POST',
        headers: {
          authorization: `ApiKey ${this.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          from: offset,
          size: limit + 1,
          query: { bool: { must: [{ multi_match: { query, fields: ['label^2', 'search_text'] } }], filter: filters } }
        })
      }
    );
    if (!response.ok) {
      throw Object.assign(new Error(`OpenSearch trả HTTP ${response.status}.`), {
        code: 'OPENSEARCH_PROVIDER_ERROR',
        status: 503
      });
    }
    const body = await response.json();
    const hits = body.hits?.hits || [];
    return {
      items: hits.slice(0, limit).map((hit) => hit._source),
      hasMore: hits.length > limit
    };
  }
}

function createProvider(name = process.env.SEARCH_PROVIDER || 'mongo') {
  const selected = String(name).toLowerCase();
  if (selected === 'mongo') return new MongoSearchProvider();
  if (selected === 'projection') return new ProjectionSearchProvider();
  if (selected === 'opensearch') return new OpenSearchProvider();
  throw Object.assign(new Error(`SEARCH_PROVIDER không hỗ trợ: ${selected}`), {
    code: 'SEARCH_PROVIDER_UNSUPPORTED',
    status: 503
  });
}

module.exports = {
  safeRegex,
  MongoSearchProvider,
  ProjectionSearchProvider,
  OpenSearchProvider,
  createProvider
};
