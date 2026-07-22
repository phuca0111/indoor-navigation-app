const {
  listForUser,
  unreadCount,
  markRead,
  markAllRead
} = require('../application/notification/notificationApplicationService');

async function listNotifications(req, res) {
  const result = await listForUser(req.user.userId, req.query);
  res.json(result);
}

async function getUnreadCount(req, res) {
  res.json({ unread_count: await unreadCount(req.user.userId) });
}

async function readNotification(req, res) {
  if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) {
    return res.status(400).json({ message: 'ID thông báo không hợp lệ.' });
  }
  const notification = await markRead(req.user.userId, req.params.id);
  if (!notification) {
    return res.status(404).json({ message: 'Không tìm thấy thông báo.' });
  }
  return res.json({ notification });
}

async function readAllNotifications(req, res) {
  const modified = await markAllRead(req.user.userId);
  res.json({ modified, unread_count: 0 });
}

module.exports = {
  listNotifications,
  getUnreadCount,
  readNotification,
  readAllNotifications
};
