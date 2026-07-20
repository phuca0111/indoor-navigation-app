const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const {
  getPublicWebsite,
  getAdminPages,
  getAdminPage,
  putAdminPageDraft,
  postAdminPagePublish,
  getAdminConfig,
  putAdminConfig,
  getAdminMedia,
  postAdminMedia,
  deleteAdminMedia,
  getAdminForms
} = require('../controllers/websiteCmsController');

router.get('/public', getPublicWebsite);

router.get('/pages', auth, getAdminPages);
router.get('/pages/:slug', auth, getAdminPage);
router.put('/pages/:slug/draft', auth, putAdminPageDraft);
router.post('/pages/:slug/publish', auth, postAdminPagePublish);

router.get('/config', auth, getAdminConfig);
router.put('/config', auth, putAdminConfig);

router.get('/media', auth, getAdminMedia);
router.post('/media', auth, postAdminMedia);
router.delete('/media/:id', auth, deleteAdminMedia);

router.get('/forms', auth, getAdminForms);

module.exports = router;
