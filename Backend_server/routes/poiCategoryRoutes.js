// GĐ1 POI Platform — catalog loại POI dùng chung cho Editor / Android / Explorer.
const express = require('express');
const { POI_CATEGORIES } = require('../utils/poiCatalog');

const router = express.Router();

/** Public: danh mục tĩnh, không dữ liệu nhạy cảm — Android cache theo ETag mặc định của express. */
router.get('/', (req, res) => {
  res.json({ success: true, data: POI_CATEGORIES });
});

module.exports = router;
