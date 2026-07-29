const express = require('express');
const router = express.Router();
const {
  getNearestExit,
  getNearestSafePoi,
  getPath,
  getOutdoorRoute
} = require('../controllers/navigationController');

// Outdoor OSRM proxy — đăng ký TRƯỚC route có :buildingId
router.get('/outdoor-route', getOutdoorRoute);
router.post('/outdoor-route', getOutdoorRoute);

// Public — Android / Gate demo trên bản publish (cùng pattern /maps/.../public)
router.get('/:buildingId/:floor/navigation/nearest-exit', getNearestExit);
router.get('/:buildingId/:floor/navigation/nearest-safe', getNearestSafePoi);
router.get('/:buildingId/:floor/navigation/path', getPath);

module.exports = router;
