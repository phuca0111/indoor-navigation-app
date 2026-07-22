const buildingApplication = require('../application/coreTenant/buildingApplicationService');
const buildingQueries = require('../application/coreTenant/buildingQueryService');

function send(res, result) {
  if (result.headers) {
    Object.entries(result.headers).forEach(([name, value]) => res.setHeader(name, value));
  }
  return res.status(result.status || 200).json(result.body);
}

function endpoint(useCase) {
  return async (req, res) => {
    try {
      return send(res, await useCase({
        actor: req.user || null,
        params: req.params || {},
        query: req.query || {},
        body: req.body || {},
        ip: req.ip || ''
      }));
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.status ? error.message : `Lỗi máy chủ: ${error.message}`,
        ...(error.code ? { code: error.code } : {}),
        ...(error.details || {})
      });
    }
  };
}

module.exports = {
  getBuildings: endpoint(buildingQueries.listBuildings),
  getBuildingById: endpoint(buildingQueries.getBuilding),
  checkLocation: endpoint(buildingQueries.checkLocation),
  createBuilding: endpoint(buildingApplication.createBuilding),
  updateBuilding: endpoint(buildingApplication.updateBuilding),
  patchBuildingFloors: endpoint(buildingApplication.patchFloors),
  deleteBuilding: endpoint(buildingApplication.deactivateBuilding),
  restoreBuilding: endpoint(buildingApplication.restoreBuilding)
};
