// ============================================
// FILE: storageRoutes.js
// Phase 2d — Storage upload API
// Mount: app.use('/api/v1', storageRoutes)
// ============================================

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { uploadBackground, deleteBackground } = require('../controllers/storageController');
const { auth } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');
const { getMaxBytes, isAllowedMime } = require('../services/objectStorage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getMaxBytes() },
  fileFilter: (req, file, cb) => {
    if (!isAllowedMime(file.mimetype)) {
      const err = new Error('Chỉ chấp nhận PNG/JPEG/WebP/GIF.');
      err.code = 'STORAGE_MIME';
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

function multerErrorHandler(err, req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message: `File vượt giới hạn ${getMaxBytes()} bytes.`,
        code: 'STORAGE_TOO_LARGE'
      });
    }
    return res.status(400).json({ message: err.message, code: err.code });
  }
  if (err.code === 'STORAGE_MIME' || err.status === 400) {
    return res.status(400).json({ message: err.message, code: err.code || 'STORAGE_MIME' });
  }
  return next(err);
}

router.post(
  '/buildings/:buildingId/floors/:floor/assets/background',
  auth,
  requireBuildingAccess,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => multerErrorHandler(err, req, res, next));
  },
  uploadBackground
);

router.delete(
  '/buildings/:buildingId/floors/:floor/assets/background',
  auth,
  requireBuildingAccess,
  deleteBackground
);

module.exports = router;
