const FeatureFlag = require('../models/FeatureFlag');
const { setFlag, isEnabled } = require('../services/featureFlagService');

function requireSuper(req, res) {
  if (req.user.role === 'SUPER_ADMIN') return true;
  res.status(403).json({ message: 'Chỉ SUPER_ADMIN được quản lý feature flags.' });
  return false;
}

async function listFlags(req, res) {
  if (!requireSuper(req, res)) return;
  const flags = await FeatureFlag.find({}).sort({ key: 1 }).lean();
  res.json({
    flags,
    maintenance_mode: await isEnabled('maintenance_mode')
  });
}

async function updateFlag(req, res) {
  if (!requireSuper(req, res)) return;
  const flag = await setFlag(req.params.key, req.body || {}, req.user.userId);
  res.json({ flag });
}

module.exports = { listFlags, updateFlag };
