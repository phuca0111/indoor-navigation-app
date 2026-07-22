const FeatureFlag = require('../models/FeatureFlag');

const cache = new Map();
const TTL_MS = Math.max(500, Number(process.env.FEATURE_FLAG_CACHE_MS) || 5000);

function cacheKey(key, orgId) {
  return `${String(key).toLowerCase()}:${orgId || 'global'}`;
}

async function isEnabled(key, orgId = null) {
  const exactKey = cacheKey(key, orgId);
  const cached = cache.get(exactKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  let flag = null;
  if (orgId) {
    flag = await FeatureFlag.findOne({
      key: String(key).toLowerCase(),
      organization_id: orgId
    }).lean();
  }
  if (!flag) {
    flag = await FeatureFlag.findOne({
      key: String(key).toLowerCase(),
      organization_id: null
    }).lean();
  }
  const value = Boolean(flag?.enabled);
  cache.set(exactKey, { value, expires: Date.now() + TTL_MS });
  return value;
}

async function setFlag(key, input, actorId) {
  const normalized = String(key || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(normalized)) {
    throw Object.assign(new Error('Key feature flag không hợp lệ.'), { status: 400 });
  }
  const organizationId = input.organization_id || null;
  const flag = await FeatureFlag.findOneAndUpdate(
    { key: normalized, organization_id: organizationId },
    {
      $set: {
        enabled: Boolean(input.enabled),
        description: String(input.description || '').slice(0, 500),
        rules: input.rules || {},
        updated_by: actorId || null
      }
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  cache.clear();
  return flag;
}

function clearCache() {
  cache.clear();
}

module.exports = { isEnabled, setFlag, clearCache };
