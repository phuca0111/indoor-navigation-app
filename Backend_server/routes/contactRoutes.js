// ============================================
// FILE: contactRoutes.js
// MỤC ĐÍCH: Landing Contact API (WL3)
// Mount: app.use('/api/contact', contactRoutes)
// ============================================

const express = require('express');
const router = express.Router();
const {
  submitContact,
  listContacts,
  updateContactStatus
} = require('../controllers/contactController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');
const { contactLimiter } = require('../middlewares/rateLimit');

router.post('/', contactLimiter, submitContact);

router.get('/', auth, requireSuperAdmin, listContacts);
router.patch('/:id', auth, requireSuperAdmin, updateContactStatus);

module.exports = router;
