const {
  listPages,
  getPage,
  savePageDraft,
  publishPage,
  getPublicBundle,
  ensureWebsiteConfig,
  updateConfig,
  listMedia,
  createMedia,
  deleteMedia,
  formInboxSummary
} = require('../services/websiteCmsService');

function requireSuper(req, res) {
  if (req.user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ message: 'Chỉ Quản trị hệ thống được quản lý Website.' });
    return false;
  }
  return true;
}

async function getPublicWebsite(req, res) {
  try {
    const data = await getPublicBundle();
    res.json(data);
  } catch (error) {
    console.error('getPublicWebsite:', error);
    res.status(500).json({ message: error.message || 'Lỗi tải website.' });
  }
}

async function getAdminPages(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    res.json({ pages: await listPages() });
  } catch (error) {
    console.error('getAdminPages:', error);
    res.status(500).json({ message: error.message || 'Lỗi tải trang Landing.' });
  }
}

async function getAdminPage(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    res.json(await getPage(req.params.slug, { draft: true }));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('getAdminPage:', error);
    res.status(status).json({ message: error.message || 'Lỗi tải trang.' });
  }
}

async function putAdminPageDraft(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const page = await savePageDraft(req.params.slug, req.body || {}, req.user?._id || req.user?.userId);
    res.json({ message: 'Đã lưu nháp.', page });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('putAdminPageDraft:', error);
    res.status(status).json({ message: error.message || 'Lỗi lưu nháp.' });
  }
}

async function postAdminPagePublish(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const page = await publishPage(req.params.slug, req.user?._id || req.user?.userId);
    res.json({ message: 'Đã xuất bản trang.', page });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('postAdminPagePublish:', error);
    res.status(status).json({ message: error.message || 'Lỗi xuất bản.' });
  }
}

async function getAdminConfig(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const config = await ensureWebsiteConfig();
    res.json(config.toObject ? config.toObject() : config);
  } catch (error) {
    console.error('getAdminConfig:', error);
    res.status(500).json({ message: error.message || 'Lỗi tải cấu hình.' });
  }
}

async function putAdminConfig(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const config = await updateConfig(req.body || {}, req.user?._id || req.user?.userId);
    res.json({ message: 'Đã lưu cấu hình website.', config });
  } catch (error) {
    console.error('putAdminConfig:', error);
    res.status(500).json({ message: error.message || 'Lỗi lưu cấu hình.' });
  }
}

async function getAdminMedia(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    res.json({ items: await listMedia({ kind: req.query.kind }) });
  } catch (error) {
    console.error('getAdminMedia:', error);
    res.status(500).json({ message: error.message || 'Lỗi tải media.' });
  }
}

async function postAdminMedia(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const item = await createMedia(req.body || {}, req.user?._id || req.user?.userId);
    res.status(201).json({ message: 'Đã thêm media.', item });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('postAdminMedia:', error);
    res.status(status).json({ message: error.message || 'Lỗi thêm media.' });
  }
}

async function deleteAdminMedia(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    await deleteMedia(req.params.id);
    res.json({ message: 'Đã xóa media.' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('deleteAdminMedia:', error);
    res.status(status).json({ message: error.message || 'Lỗi xóa media.' });
  }
}

async function getAdminForms(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    res.json({ forms: await formInboxSummary() });
  } catch (error) {
    console.error('getAdminForms:', error);
    res.status(500).json({ message: error.message || 'Lỗi tải form.' });
  }
}

module.exports = {
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
};
