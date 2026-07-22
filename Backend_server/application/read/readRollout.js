/**
 * Read-model V2 rollout: feature flag + sampled shadow comparison.
 * Cache / materialized projections are intentionally absent until benchmark
 * evidence proves they are required.
 */
const crypto = require('crypto');

function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  return String(raw).toLowerCase() === 'true';
}

function envRate(name, defaultValue = 0) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.min(1, Math.max(0, n));
}

function isReadV2Enabled(surface) {
  if (envFlag('READ_MODEL_V2', false)) return true;
  const key = `READ_MODEL_V2_${String(surface || '').toUpperCase()}`;
  return envFlag(key, false);
}

function shadowSampleRate(surface) {
  const specific = process.env[`READ_SHADOW_RATE_${String(surface || '').toUpperCase()}`];
  if (specific != null && specific !== '') return envRate(`READ_SHADOW_RATE_${String(surface || '').toUpperCase()}`, 0);
  return envRate('READ_SHADOW_RATE', 0.05);
}

function shouldShadowCompare(surface, sampleKey = '') {
  if (envFlag('READ_SHADOW_COMPARE', false) === false &&
      process.env.READ_SHADOW_COMPARE == null) {
    // default: shadow when V2 is not primary, sampled
  }
  if (envFlag('READ_SHADOW_COMPARE_FORCE', false)) return true;
  if (!envFlag('READ_SHADOW_COMPARE', true)) return false;
  const rate = shadowSampleRate(surface);
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const hash = crypto
    .createHash('sha1')
    .update(`${surface}:${sampleKey}:${Date.now() >> 16}`)
    .digest()[0];
  return hash / 255 < rate;
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function fingerprintPayload(payload) {
  return crypto
    .createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Run primary path; optionally sample-compare against alternate path.
 * Does not change the returned primary result.
 */
async function withShadowComparison({
  surface,
  sampleKey = '',
  primary,
  shadow,
  preferV2 = null
}) {
  const useV2 = preferV2 == null ? isReadV2Enabled(surface) : preferV2;
  const primaryFn = useV2 ? (shadow && primary ? primary : primary) : primary;
  const shadowFn = useV2 ? shadow : primary;
  // When V2 enabled: primary=V2 impl passed as `primary`, shadow=legacy as `shadow`.
  // Callers pass { primary: v2OrLegacySelected, shadow: other }.
  const result = await primaryFn();
  if (typeof shadowFn === 'function' && shouldShadowCompare(surface, sampleKey)) {
    try {
      const alt = await shadowFn();
      const left = fingerprintPayload(result);
      const right = fingerprintPayload(alt);
      if (left !== right) {
        console.warn(
          `[ReadShadow:${surface}] mismatch primary=${left} shadow=${right} key=${sampleKey}`
        );
      }
    } catch (err) {
      console.warn(`[ReadShadow:${surface}] shadow failed:`, err.message);
    }
  }
  return result;
}

async function runReadVersioned({
  surface,
  sampleKey = '',
  legacyFn,
  v2Fn
}) {
  const useV2 = isReadV2Enabled(surface);
  if (useV2) {
    return withShadowComparison({
      surface,
      sampleKey,
      primary: v2Fn,
      shadow: legacyFn
    });
  }
  return withShadowComparison({
    surface,
    sampleKey,
    primary: legacyFn,
    shadow: envFlag('READ_SHADOW_COMPARE', true) ? v2Fn : null
  });
}

module.exports = {
  isReadV2Enabled,
  shouldShadowCompare,
  fingerprintPayload,
  withShadowComparison,
  runReadVersioned,
  stableStringify
};
