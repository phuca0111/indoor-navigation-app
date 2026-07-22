const queries = require('../application/mapLifecycle/mapLifecycleQueryService');
const commands = require('../application/mapLifecycle/rollbackApplicationService');

function numbers(req) {
  const floorNumber = Number.parseInt(req.params.floor, 10);
  const version = req.params.version == null ? null : Number.parseInt(req.params.version, 10);
  if (!Number.isFinite(floorNumber) || (version != null && !Number.isFinite(version))) {
    throw Object.assign(new Error('Tầng hoặc phiên bản không hợp lệ.'), { status: 400 });
  }
  return { floorNumber, version };
}

function fail(res, error, prefix) {
  return res.status(error.status || 500).json({
    message: error.status ? error.message : `${prefix}: ${error.message}`,
    code: error.code,
    reason: error.reason
  });
}

async function getVersions(req, res) {
  try {
    const { floorNumber } = numbers(req);
    return res.status(200).json(await queries.listVersions(req.params.buildingId, floorNumber));
  } catch (error) {
    return fail(res, error, 'Lỗi máy chủ');
  }
}

async function getVersionDetail(req, res) {
  try {
    const { floorNumber, version } = numbers(req);
    const row = await queries.versionDetail(req.params.buildingId, floorNumber, version);
    if (!row) return res.status(404).json({ message: 'Không tìm thấy phiên bản này!' });
    return res.status(200).json(row);
  } catch (error) {
    return fail(res, error, 'Lỗi máy chủ');
  }
}

async function rollbackVersion(req, res) {
  try {
    const { floorNumber, version } = numbers(req);
    const result = await commands.rollbackVersion({
      actor: req.user,
      buildingId: req.params.buildingId,
      floorNumber,
      targetVersion: version,
      ip: req.ip || ''
    });
    return res.status(200).json({
      message: result.rollbackMode === 'full'
        ? `Đã khôi phục bản đồ tầng ${floorNumber} từ phiên bản ${version} (v${result.floor.version}).`
        : `Đã khôi phục nodes/edges tầng ${floorNumber} từ phiên bản ${version} (v${result.floor.version}). Bản cũ không có snapshot đầy đủ.`,
      rollback_mode: result.rollbackMode,
      rolled_back_from: version,
      map: result.floor
    });
  } catch (error) {
    return fail(res, error, 'Lỗi rollback');
  }
}

module.exports = { getVersions, getVersionDetail, rollbackVersion };
