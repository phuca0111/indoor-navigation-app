const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/emergencyController');
const { auth, requireAnyPermission, P } = require('../middlewares/auth');

const incidentWrite = requireAnyPermission(
  P.EMERGENCY_INCIDENT_WRITE
);
const commandRead = requireAnyPermission(
  P.EMERGENCY_COMMAND_READ,
  P.EMERGENCY_INCIDENT_WRITE
);
const broadcastPerm = requireAnyPermission(
  P.EMERGENCY_BROADCAST,
  P.EMERGENCY_INCIDENT_WRITE
);
const locationRead = requireAnyPermission(
  P.EMERGENCY_LOCATION_READ,
  P.EMERGENCY_COMMAND_READ,
  P.EMERGENCY_INCIDENT_WRITE
);

// Incident
router.get('/incidents', auth, commandRead, ctrl.listIncidents);
router.post('/incidents', auth, incidentWrite, ctrl.createIncident);
router.get('/incidents/:id', auth, commandRead, ctrl.getIncident);
router.patch('/incidents/:id', auth, incidentWrite, ctrl.updateIncident);
router.post('/incidents/:id/status', auth, incidentWrite, ctrl.updateIncidentStatus);

// Hazard zones
router.get('/incidents/:incidentId/hazard-zones', auth, commandRead, ctrl.listHazardZones);
router.post('/incidents/:incidentId/hazard-zones', auth, incidentWrite, ctrl.createHazardZone);
router.post('/incidents/:incidentId/hazard-zones/activate', auth, incidentWrite, ctrl.activateHazardZones);
router.post('/incidents/:incidentId/hazard-zones/deactivate', auth, incidentWrite, ctrl.deactivateHazardZones);
router.patch('/hazard-zones/:id', auth, incidentWrite, ctrl.updateHazardZone);
router.delete('/hazard-zones/:id', auth, incidentWrite, ctrl.deleteHazardZone);

// Policy
router.get('/policies', auth, commandRead, ctrl.listPolicies);
router.get('/policies/:hazardType', auth, commandRead, ctrl.getPolicy);
router.put('/policies/:hazardType', auth, incidentWrite, ctrl.upsertPolicy);

// Resources (public read on published map)
router.get('/buildings/:buildingId/resources', ctrl.listSafeResources);

// App end-user: sự cố đang ACTIVE của tòa nhà (không cần quyền quản trị)
router.get('/buildings/:buildingId/active', ctrl.getActiveIncidentForBuilding);

// MVP cảm biến cộng đồng: mọi user đã đăng nhập gửi shake report (mọi tòa có presence)
router.post('/shake-reports', auth, ctrl.submitShakeReport);
// Admin: tổng quan mạng cảm biến + sự cố EARTHQUAKE
router.get('/seismic/overview', auth, commandRead, ctrl.getSeismicOverview);

// Broadcast
router.post('/incidents/:incidentId/broadcast', auth, broadcastPerm, ctrl.createBroadcast);
router.get('/incidents/:incidentId/broadcast', auth, commandRead, ctrl.getBroadcastStatus);

router.get('/locations/possibly-trapped', auth, locationRead, ctrl.listPossiblyTrapped);

// Location
router.post('/incidents/:incidentId/location', auth, ctrl.reportLocation);
router.get('/incidents/:incidentId/location/me', auth, ctrl.getMyLastLocation);
router.get('/incidents/:incidentId/locations', auth, locationRead, ctrl.listLocations);

// Evacuation
router.get('/incidents/:incidentId/buildings/:buildingId/:floor/evacuation', ctrl.getEvacuationRoute);

// Command Center
router.get('/incidents/:incidentId/command-center', auth, commandRead, ctrl.getCommandCenterSnapshot);

module.exports = router;
