const searchRepository = require('../../repositories/searchRepository');
const { allowedTypes, buildScope } = require('./searchPolicy');
const { createProvider } = require('./searchProviders');

function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(value.offset) || value.offset < 0) throw new Error();
    return value.offset;
  } catch {
    throw Object.assign(new Error('Cursor tìm kiếm không hợp lệ.'), {
      status: 400,
      code: 'SEARCH_CURSOR_INVALID'
    });
  }
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

async function globalSearch(actor, rawQuery, rawLimit = 8, options = {}) {
  const query = String(rawQuery || '').trim();
  if (query.length < 2) return options.withMeta ? { items: [], next_cursor: null } : [];
  const actorData = await searchRepository.actorData(actor.userId);
  const scope = await buildScope(actor, actorData, searchRepository);
  const types = allowedTypes(actor, options.types);
  const limit = Math.min(50, Math.max(2, Number(rawLimit) || 8));
  const offset = decodeCursor(options.cursor);
  const primary = createProvider().search({ query, limit, offset, types, scope });
  if (String(process.env.SEARCH_SHADOW_MODE).toLowerCase() === 'true') {
    const shadowName = process.env.SEARCH_SHADOW_PROVIDER || 'projection';
    const [result, shadow] = await Promise.allSettled([
      primary,
      createProvider(shadowName).search({ query, limit, offset, types, scope })
    ]);
    if (result.status === 'rejected') throw result.reason;
    if (shadow.status === 'rejected') {
      console.warn('[Search shadow]', shadow.reason.message);
    } else {
      const primaryIds = result.value.items.map((item) => `${item.type}:${item.id}`).join(',');
      const shadowIds = shadow.value.items.map((item) => `${item.type}:${item.id}`).join(',');
      if (primaryIds !== shadowIds) console.warn('[Search shadow] result mismatch');
    }
    return format(result.value, offset, limit, options.withMeta);
  }
  return format(await primary, offset, limit, options.withMeta);
}

function format(result, offset, limit, withMeta) {
  const value = {
    items: result.items,
    next_cursor: result.hasMore ? encodeCursor(offset + limit) : null
  };
  return withMeta ? value : value.items;
}

function projectionFromEvent(event, source) {
  const type = String(event.payload.resource_type || '').toLowerCase();
  const deleted = Boolean(event.payload.deleted);
  if (type === 'article') {
    return {
      projection_key: `article:${source._id}`,
      type,
      source_id: String(source._id),
      visibility: source.status === 'PUBLISHED' && !source.deleted_at ? 'PUBLIC' : 'PLATFORM',
      label: source.title,
      detail: `${source.type} · ${source.status}`,
      search_text: `${source.title} ${source.slug} ${source.excerpt || ''}`.toLowerCase(),
      route: { tab: 'website', websiteSub: 'articles' },
      source_version: Number(source.revision) || 0,
      deleted
    };
  }
  return {
    projection_key: `media:${source._id}`,
    type: 'media',
    source_id: String(source._id),
    organization_id: source.organization_id || null,
    visibility: 'PLATFORM',
    label: source.name,
    detail: source.alt || source.kind,
    search_text: `${source.name} ${source.alt || ''} ${source.kind || ''}`.toLowerCase(),
    route: { tab: 'website', websiteSub: 'media' },
    source_version: Number(source.revision) || 0,
    deleted
  };
}

async function projectContentEvent(event) {
  const type = String(event.payload?.resource_type || '').toLowerCase();
  if (!['article', 'media'].includes(type)) return;
  const source = await searchRepository.findProjectionSource(type, event.payload.resource_id);
  if (!source) {
    return searchRepository.upsertProjection({
      projection_key: `${type}:${event.payload.resource_id}`,
      type,
      source_id: String(event.payload.resource_id),
      visibility: 'PLATFORM',
      label: '[deleted]',
      detail: '',
      search_text: '[deleted]',
      source_version: Number(event.payload.revision) || 0,
      deleted: true
    });
  }
  return searchRepository.upsertProjection(projectionFromEvent(event, source));
}

async function rebuildIndex({ type, batchSize = 100 } = {}) {
  const types = type ? [type] : ['article', 'media'];
  const results = {};
  for (const sourceType of types) {
    const key = `search-rebuild:${sourceType}:v1`;
    let checkpoint = await searchRepository.getCheckpoint(key);
    let lastId = checkpoint?.completed ? '' : checkpoint?.last_id || '';
    let processed = checkpoint?.completed ? 0 : Number(checkpoint?.processed) || 0;
    let rows;
    do {
      rows = await searchRepository.listProjectionSources(sourceType, lastId, batchSize);
      for (const source of rows) {
        await searchRepository.upsertProjection(projectionFromEvent({
          payload: {
            resource_type: sourceType.toUpperCase(),
            resource_id: source._id,
            revision: source.revision,
            deleted: Boolean(source.deleted_at) || source.status === 'PURGED'
          }
        }, source));
        lastId = String(source._id);
        processed += 1;
      }
      await searchRepository.saveCheckpoint(key, {
        last_id: lastId,
        processed,
        changed: processed,
        completed: rows.length < batchSize,
        metadata: { source_type: sourceType, shadow_ready: rows.length < batchSize }
      });
    } while (rows.length === batchSize);
    results[sourceType] = processed;
  }
  return results;
}

module.exports = {
  globalSearch,
  decodeCursor,
  encodeCursor,
  projectContentEvent,
  rebuildIndex
};
