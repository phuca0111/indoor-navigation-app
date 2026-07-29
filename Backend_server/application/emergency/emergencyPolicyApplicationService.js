/**
 * Phase 3 — Emergency Policy ("bộ não" — rule JSON theo hazard_type).
 */
const EmergencyPolicy = require('../../models/EmergencyPolicy');
const { HAZARD_TYPES } = require('../../models/HazardZone');
const { httpError } = require('../../utils/navigationGraph');

const DEFAULT_POLICIES = Object.freeze({
  FIRE: {
    broadcast: true,
    location_tracking: true,
    block_elevators: true,
    avoid_hazard_types: ['FIRE', 'SMOKE'],
    prefer_targets: ['EXIT', 'ASSEMBLY_POINT'],
    navigation_mode: 'EVACUATION',
    assembly_required: true
  },
  FLOOD: {
    broadcast: true,
    location_tracking: true,
    block_elevators: true,
    avoid_basement: true,
    prefer_targets: ['EXIT', 'ASSEMBLY_POINT'],
    navigation_mode: 'EVACUATION'
  },
  GAS: {
    broadcast: true,
    location_tracking: true,
    block_elevators: true,
    prefer_targets: ['EXIT'],
    navigation_mode: 'EVACUATION'
  },
  SMOKE: {
    broadcast: true,
    location_tracking: true,
    block_elevators: true,
    avoid_hazard_types: ['FIRE', 'SMOKE'],
    prefer_targets: ['EXIT', 'ASSEMBLY_POINT'],
    navigation_mode: 'EVACUATION'
  },
  EARTHQUAKE: {
    broadcast: true,
    location_tracking: true,
    avoid_elevators: true,
    block_elevators: true,
    prefer_targets: ['ASSEMBLY_POINT', 'EXIT'],
    assembly_required: true,
    navigation_mode: 'EVACUATION'
  },
  COLLAPSE: {
    broadcast: true,
    location_tracking: true,
    block_elevators: true,
    prefer_targets: ['EXIT'],
    navigation_mode: 'EVACUATION'
  },
  ELECTRIC: {
    broadcast: true,
    location_tracking: false,
    prefer_targets: ['EXIT'],
    navigation_mode: 'EVACUATION'
  },
  CROWD: {
    broadcast: true,
    location_tracking: true,
    prefer_targets: ['EXIT', 'ASSEMBLY_POINT'],
    navigation_mode: 'EVACUATION'
  },
  OTHER: {
    broadcast: true,
    location_tracking: true,
    prefer_targets: ['EXIT', 'ASSEMBLY_POINT'],
    navigation_mode: 'EVACUATION'
  }
});

function mergePolicyRules(hazardType, storedRules = {}) {
  const defaults = DEFAULT_POLICIES[hazardType] || DEFAULT_POLICIES.OTHER;
  return { ...defaults, ...storedRules };
}

async function ensureDefaultPolicies() {
  for (const hazardType of HAZARD_TYPES) {
    await EmergencyPolicy.findOneAndUpdate(
      { hazard_type: hazardType },
      { $setOnInsert: { rules: DEFAULT_POLICIES[hazardType] || DEFAULT_POLICIES.OTHER } },
      { upsert: true, new: true }
    );
  }
}

async function getPolicyByType(hazardType) {
  const key = String(hazardType || 'OTHER').trim().toUpperCase();
  let doc = await EmergencyPolicy.findOne({ hazard_type: key }).lean();
  if (!doc) {
    await ensureDefaultPolicies();
    doc = await EmergencyPolicy.findOne({ hazard_type: key }).lean();
  }
  return mergePolicyRules(key, doc?.rules || {});
}

async function listPolicies() {
  await ensureDefaultPolicies();
  const rows = await EmergencyPolicy.find({}).sort({ hazard_type: 1 }).lean();
  return {
    status: 200,
    body: {
      policies: rows.map((row) => ({
        hazard_type: row.hazard_type,
        rules: mergePolicyRules(row.hazard_type, row.rules || {}),
        version: row.version,
        updatedAt: row.updatedAt
      }))
    }
  };
}

async function getPolicy(input = {}) {
  const hazardType = String(input.params?.hazardType || '').trim().toUpperCase();
  if (!hazardType) throw httpError(400, 'Thiếu hazard_type.', 'HAZARD_TYPE_REQUIRED');
  const rules = await getPolicyByType(hazardType);
  return { status: 200, body: { hazard_type: hazardType, rules } };
}

async function upsertPolicy(input = {}) {
  const hazardType = String(input.params?.hazardType || input.body?.hazard_type || '').trim().toUpperCase();
  if (!HAZARD_TYPES.includes(hazardType)) {
    throw httpError(400, 'hazard_type không hợp lệ.', 'HAZARD_TYPE_INVALID');
  }
  const rules = input.body?.rules;
  if (!rules || typeof rules !== 'object') {
    throw httpError(400, 'Thiếu rules JSON.', 'POLICY_RULES_REQUIRED');
  }

  const doc = await EmergencyPolicy.findOneAndUpdate(
    { hazard_type: hazardType },
    {
      $set: {
        rules: { ...DEFAULT_POLICIES[hazardType], ...rules },
        updated_by: input.actor?.userId || null
      },
      $inc: { version: 1 }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    status: 200,
    body: {
      hazard_type: doc.hazard_type,
      rules: mergePolicyRules(doc.hazard_type, doc.rules),
      version: doc.version
    }
  };
}

module.exports = {
  DEFAULT_POLICIES,
  mergePolicyRules,
  ensureDefaultPolicies,
  getPolicyByType,
  listPolicies,
  getPolicy,
  upsertPolicy
};
