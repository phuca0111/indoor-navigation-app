const buildingApplication = require('../application/coreTenant/buildingApplicationService');
const buildingQueries = require('../application/coreTenant/buildingQueryService');
const buildingExplorer = require('../application/coreTenant/buildingExplorerApplicationService');
const indoorSearch = require('../application/coreTenant/indoorSearchApplicationService');
const mapHealth = require('../application/mapLifecycle/mapHealthApplicationService');

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
  /** GĐ2 Building Explorer — public summary trước Enter Indoor */
  getBuildingExplorer: endpoint(buildingExplorer.getBuildingExplorer),
  /** GĐ4 Indoor Search — tìm POI trong nhà từ outdoor (public) */
  searchIndoorPois: endpoint(indoorSearch.searchIndoorPois),
  /** P2.2 Map Health — tín hiệu OUTDATED / MISSING_POI / NO_MAP theo tầng */
  getBuildingMapHealth: endpoint(mapHealth.getBuildingMapHealth),
  checkLocation: endpoint(buildingQueries.checkLocation),
  createBuilding: endpoint(buildingApplication.createBuilding),
  updateBuilding: endpoint(buildingApplication.updateBuilding),
  patchBuildingFloors: endpoint(buildingApplication.patchFloors),
  renameBuildingFloor: endpoint(buildingApplication.renameFloor),
  duplicateBuildingFloor: endpoint(buildingApplication.duplicateFloor),
  setBuildingFloorVisibility: endpoint(buildingApplication.setFloorVisibility),
  reorderBuildingFloors: endpoint(buildingApplication.reorderFloors),
  deleteBuilding: endpoint(buildingApplication.deactivateBuilding),
  restoreBuilding: endpoint(buildingApplication.restoreBuilding)
};
