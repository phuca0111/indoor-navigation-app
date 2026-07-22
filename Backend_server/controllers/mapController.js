const publishedMapQueries = require('../application/coreTenant/publishedMapQueryService');
const mapLifecycle = require('../services/legacyMapLifecycleHttpService');

function send(res, result) {
  if (result.headers) {
    Object.entries(result.headers).forEach(([name, value]) => res.setHeader(name, value));
  }
  return res.status(result.status || 200).json(result.body);
}

function queryEndpoint(useCase) {
  return async (req, res) => {
    try {
      return send(res, await useCase({
        actor: req.user || null,
        buildingId: req.params.buildingId,
        floor: req.params.floor,
        ip: req.ip || ''
      }));
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.status ? error.message : `Lỗi tải bản đồ: ${error.message}`,
        ...(error.code ? { code: error.code } : {})
      });
    }
  };
}

module.exports = {
  loadMap: queryEndpoint(publishedMapQueries.loadMap),
  downloadMap: queryEndpoint(publishedMapQueries.downloadMap),
  saveMap: mapLifecycle.saveMap,
  saveDraft: mapLifecycle.saveDraft,
  getDraft: mapLifecycle.getDraft,
  syncQrCodes: mapLifecycle.syncQrCodes
};
