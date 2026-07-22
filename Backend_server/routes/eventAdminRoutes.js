const express = require('express');
const { auth, requireSuperAdmin } = require('../middlewares/auth');
const {
  listDeadEvents,
  replayEvent
} = require('../controllers/eventAdminController');

const router = express.Router();
router.use(auth, requireSuperAdmin);
router.get('/dead-letter', listDeadEvents);
router.post('/:eventId/replay', replayEvent);

module.exports = router;
