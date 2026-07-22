const express = require('express');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const { getMaxBytes } = require('../services/objectStorage');
const { auth, requirePermission, P } = require('../middlewares/auth');
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
  postMediaUploadIntent,
  postMediaUploadComplete,
  purgeAdminMedia,
  getAdminForms,
  getPublicArticles,
  getPublicArticle,
  getPublicBanners,
  getAdminArticles,
  getAdminArticle,
  postAdminArticle,
  putAdminArticle,
  deleteAdminArticle,
  getAdminBanners,
  postAdminBanner,
  putAdminBanner,
  deleteAdminBanner,
  getAdminAuditLogs,
  postRestoreCmsVersion
} = require('../controllers/websiteCmsController');

router.get('/public', getPublicWebsite);
router.get('/public/articles', getPublicArticles);
router.get('/public/articles/:slug', getPublicArticle);
router.get('/public/banners', getPublicBanners);

const cmsAdmin = [auth, requirePermission(P.PLATFORM_CMS_MANAGE)];
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getMaxBytes(), files: 1 }
});
const mediaWriteLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: Math.max(1, Number(process.env.CMS_MEDIA_RATE_LIMIT) || 30),
  standardHeaders: true,
  legacyHeaders: false
});

router.get('/pages', ...cmsAdmin, getAdminPages);
router.get('/pages/:slug', ...cmsAdmin, getAdminPage);
router.put('/pages/:slug/draft', ...cmsAdmin, putAdminPageDraft);
router.post('/pages/:slug/publish', ...cmsAdmin, postAdminPagePublish);

router.get('/config', ...cmsAdmin, getAdminConfig);
router.put('/config', ...cmsAdmin, putAdminConfig);

router.get('/media', ...cmsAdmin, getAdminMedia);
router.post('/media', ...cmsAdmin, mediaWriteLimit, (req, res, next) => {
  if (!String(req.headers['content-type'] || '').startsWith('multipart/form-data')) return next();
  mediaUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ message: error.message, code: error.code });
  });
}, postAdminMedia);
router.post('/media/upload-intent', ...cmsAdmin, mediaWriteLimit, postMediaUploadIntent);
router.post('/media/complete', ...cmsAdmin, mediaWriteLimit, postMediaUploadComplete);
router.delete('/media/:id', ...cmsAdmin, mediaWriteLimit, deleteAdminMedia);
router.delete('/media/:id/purge', ...cmsAdmin, mediaWriteLimit, purgeAdminMedia);

router.get('/forms', ...cmsAdmin, getAdminForms);

router.get('/articles', ...cmsAdmin, getAdminArticles);
router.get('/articles/:id', ...cmsAdmin, getAdminArticle);
router.post('/articles', ...cmsAdmin, postAdminArticle);
router.put('/articles/:id', ...cmsAdmin, putAdminArticle);
router.delete('/articles/:id', ...cmsAdmin, deleteAdminArticle);

router.get('/banners', ...cmsAdmin, getAdminBanners);
router.post('/banners', ...cmsAdmin, postAdminBanner);
router.put('/banners/:id', ...cmsAdmin, putAdminBanner);
router.delete('/banners/:id', ...cmsAdmin, deleteAdminBanner);

router.get('/audit-logs', ...cmsAdmin, getAdminAuditLogs);
router.post('/audit-logs/:id/restore', ...cmsAdmin, postRestoreCmsVersion);

module.exports = router;
