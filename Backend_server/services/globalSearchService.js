const { createSearchProvider, safeRegex } = require('./searchProvider');

async function globalSearch(actor, rawQuery, limit = 8, options = {}) {
  const query = String(rawQuery || '').trim();
  if (query.length < 2) return [];
  const result = await createSearchProvider().search({
    actor,
    query,
    limit: Math.min(50, Math.max(2, Number(limit) || 8)),
    cursor: options.cursor,
    types: options.types
  });
  return options.withMeta ? result : result.items;
}

module.exports = { globalSearch, safeRegex };
