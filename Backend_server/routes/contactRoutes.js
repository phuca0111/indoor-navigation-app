const express = require('express');
const router = express.Router();
const {
  submitContact,
  listContacts,
  getContact,
  updateContact,
  updateContactStatus,
  replyContact,
  removeContact,
  getContactStats,
  getContactUnread
} = require('../controllers/contactController');
const { auth, requirePermission, P } = require('../middlewares/auth');
const { contactLimiter } = require('../middlewares/rateLimit');

router.post('/', contactLimiter, submitContact);

const contactAdmin = [auth, requirePermission(P.PLATFORM_CONTACTS_MANAGE)];

router.get('/', ...contactAdmin, listContacts);
router.get('/stats', ...contactAdmin, getContactStats);
router.get('/unread-count', ...contactAdmin, getContactUnread);
router.get('/:id', ...contactAdmin, getContact);
router.patch('/:id', ...contactAdmin, updateContact);
router.patch('/:id/status', ...contactAdmin, updateContactStatus);
router.post('/:id/reply', ...contactAdmin, replyContact);
router.delete('/:id', ...contactAdmin, removeContact);

module.exports = router;
