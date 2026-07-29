const incidentService = require('../application/emergency/incidentApplicationService');
const hazardService = require('../application/emergency/hazardZoneApplicationService');
const policyService = require('../application/emergency/emergencyPolicyApplicationService');
const resourcesService = require('../application/emergency/emergencyResourcesApplicationService');
const broadcastService = require('../application/emergency/broadcastApplicationService');
const locationService = require('../application/emergency/emergencyLocationApplicationService');
const evacuationService = require('../application/emergency/evacuationRoutingApplicationService');
const commandCenterService = require('../application/emergency/commandCenterApplicationService');
const seismicService = require('../application/emergency/seismicDetectionApplicationService');
const { getClientIp } = require('../utils/ipHelper');

function send(res, result) {
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
        ip: getClientIp(req)
      }));
    } catch (error) {
      if (error?.name === 'CastError' || /Cast to ObjectId failed/i.test(String(error?.message || ''))) {
        return res.status(400).json({
          message: 'Mã không hợp lệ. Kiểm tra lại tòa nhà hoặc mã sự cố.',
          code: 'INVALID_OBJECT_ID'
        });
      }
      return res.status(error.status || 500).json({
        message: error.status ? error.message : `Lỗi máy chủ: ${error.message}`,
        ...(error.code ? { code: error.code } : {})
      });
    }
  };
}

module.exports = {
  listIncidents: endpoint(incidentService.listIncidents),
  getIncident: endpoint(incidentService.getIncident),
  createIncident: endpoint(incidentService.createIncident),
  updateIncident: endpoint(incidentService.updateIncident),
  updateIncidentStatus: endpoint(incidentService.updateIncidentStatus),
  getActiveIncidentForBuilding: endpoint(incidentService.getActiveIncidentForBuilding),

  listHazardZones: endpoint(hazardService.listHazardZones),
  createHazardZone: endpoint(hazardService.createHazardZone),
  updateHazardZone: endpoint(hazardService.updateHazardZone),
  activateHazardZones: endpoint(hazardService.activateHazardZones),
  deactivateHazardZones: endpoint(hazardService.deactivateHazardZones),
  deleteHazardZone: endpoint(hazardService.deleteHazardZone),

  listPolicies: endpoint(policyService.listPolicies),
  getPolicy: endpoint(policyService.getPolicy),
  upsertPolicy: endpoint(policyService.upsertPolicy),

  listSafeResources: endpoint(resourcesService.listSafeResources),

  createBroadcast: endpoint(broadcastService.createBroadcast),
  getBroadcastStatus: endpoint(broadcastService.getBroadcastStatus),

  reportLocation: endpoint(locationService.reportLocation),
  listLocations: endpoint(locationService.listLocations),
  getMyLastLocation: endpoint(locationService.getMyLastLocation),
  listPossiblyTrapped: endpoint(locationService.listPossiblyTrapped),

  getEvacuationRoute: endpoint(evacuationService.getEvacuationRoute),

  getCommandCenterSnapshot: endpoint(commandCenterService.getCommandCenterSnapshot),
  listRecentLocations: endpoint(commandCenterService.listRecentLocations),

  /** MVP — điện thoại gửi tín hiệu rung → gom theo tòa → EARTHQUAKE */
  submitShakeReport: endpoint(seismicService.submitShakeReport),
  getSeismicOverview: endpoint(seismicService.getSeismicOverview)
};
