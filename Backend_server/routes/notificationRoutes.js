const express = require('express');
const { auth } = require('../middlewares/auth');
const {
  listNotifications,
  getUnreadCount,
  readNotification,
  readAllNotifications
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/', auth, listNotifications);
router.get('/unread-count', auth, getUnreadCount);
router.patch('/:id/read', auth, readNotification);
router.post('/read-all', auth, readAllNotifications);

module.exports = router;
