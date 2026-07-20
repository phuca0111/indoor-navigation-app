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
const { auth, requireSuperAdmin } = require('../middlewares/auth');
const { contactLimiter } = require('../middlewares/rateLimit');

router.post('/', contactLimiter, submitContact);

router.get('/', auth, requireSuperAdmin, listContacts);
router.get('/stats', auth, requireSuperAdmin, getContactStats);
router.get('/unread-count', auth, requireSuperAdmin, getContactUnread);
router.get('/:id', auth, requireSuperAdmin, getContact);
router.patch('/:id', auth, requireSuperAdmin, updateContact);
router.patch('/:id/status', auth, requireSuperAdmin, updateContactStatus);
router.post('/:id/reply', auth, requireSuperAdmin, replyContact);
router.delete('/:id', auth, requireSuperAdmin, removeContact);

module.exports = router;
