const {
  formInboxSummary
} = require('../application/content/formInboxQueryService');
const mediaApplication = require('../application/content/mediaApplicationService');
const cmsContent = require('../application/content/cmsApplicationService');

function requireSuper(req, res) {
  const { roleHasPermission, P } = require('../utils/permissions');
  if (!roleHasPermission(req.user?.role, P.PLATFORM_CMS_MANAGE)) {
    res.status(403).json({
      message: 'Chỉ Quản trị hệ thống được quản lý Website.',
      code: 'PERMISSION_DENIED',
      required: [P.PLATFORM_CMS_MANAGE]
    });
    return false;
  }
  return true;
}

async function getPublicWebsite(req, res) {
  try {
    const data = await cmsContent.getPublicBundle();
    res.json(data);
  } catch (error) {
    console.error('getPublicWebsite:', error);
    res.status(500).json({ message: error.message || 'Lỗi tải website.' });
  }
}

async function getAdminPages(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    res.json({ pages: await cmsContent.listPages() });
  } catch (error) {
    console.error('getAdminPages:', error);
    res.status(500).json({ message: error.message || 'Lỗi tải trang Landing.' });
  }
}

async function getAdminPage(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    res.json(await cmsContent.getPage(req.params.slug, { draft: true }));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('getAdminPage:', error);
    res.status(status).json({ message: error.message || 'Lỗi tải trang.' });
  }
}

async function putAdminPageDraft(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const page = await cmsContent.savePageDraft(
      req.params.slug,
      req.body || {},
      cmsContext(req)
    );
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
    const page = await cmsContent.publishPage(req.params.slug, cmsContext(req));
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
    res.json(await cmsContent.getAdminConfig());
  } catch (error) {
    console.error('getAdminConfig:', error);
    res.status(500).json({ message: error.message || 'Lỗi tải cấu hình.' });
  }
}

async function putAdminConfig(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const config = await cmsContent.updateConfig(req.body || {}, cmsContext(req));
    res.json({ message: 'Đã lưu cấu hình website.', config });
  } catch (error) {
    console.error('putAdminConfig:', error);
    res.status(500).json({ message: error.message || 'Lỗi lưu cấu hình.' });
  }
}

async function getAdminMedia(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    res.json(await mediaApplication.listMedia(req.query));
  } catch (error) {
    console.error('getAdminMedia:', error);
    res.status(500).json({ message: error.message || 'Lỗi tải media.' });
  }
}

async function postAdminMedia(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    const actorId = req.user?._id || req.user?.userId;
    const context = {
      actorId,
      organizationId: req.user?.organization_id || null,
      correlationId: req.context?.correlationId || req.requestId || '',
      ip: req.ip,
      req
    };
    const item = req.file
      ? await mediaApplication.uploadMedia(req.file, req.body || {}, context)
      : await mediaApplication.createExternalMedia(req.body || {}, context);
    res.status(201).json({ message: 'Đã thêm media.', item });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('postAdminMedia:', error);
    res.status(status).json({ message: error.message || 'Lỗi thêm media.' });
  }
}

async function postMediaUploadIntent(req, res) {
  try {
    const item = await mediaApplication.createUploadIntent(req.body || {}, {
      actorId: req.user?._id || req.user?.userId,
      organizationId: req.user?.organization_id || null
    });
    res.status(201).json(item);
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tạo upload intent.');
  }
}

async function postMediaUploadComplete(req, res) {
  try {
    const item = await mediaApplication.completeUploadIntent(req.body || {}, {
      actorId: req.user?._id || req.user?.userId,
      organizationId: req.user?.organization_id || null
    });
    res.status(201).json({ message: 'Đã hoàn tất upload.', item });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi hoàn tất upload.');
  }
}

async function purgeAdminMedia(req, res) {
  try {
    const item = await mediaApplication.purgeMedia(req.params.id, cmsContext(req));
    res.json({ message: 'Đã xóa vật lý media.', item });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi purge media.');
  }
}

async function deleteAdminMedia(req, res) {
  try {
    if (!requireSuper(req, res)) return;
    await mediaApplication.deleteMedia(req.params.id, cmsContext(req));
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

function cmsContext(req) {
  return {
    actorId: req.user?.userId || req.user?._id,
    organizationId: req.user?.organization_id || null,
    ip: req.ip || req.headers['x-forwarded-for'] || '',
    correlationId: req.context?.correlationId || req.requestId || ''
  };
}

function sendCmsError(res, error, fallback) {
  const status = error.status || (error.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({ message: error.message || fallback });
}

async function getPublicArticles(req, res) {
  try {
    res.json(await cmsContent.listPublicArticles(req.query));
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tải bài viết.');
  }
}

async function getPublicArticle(req, res) {
  try {
    res.json({ item: await cmsContent.getPublicArticle(req.params.slug) });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tải bài viết.');
  }
}

async function getPublicBanners(req, res) {
  try {
    res.json({ items: await cmsContent.listPublicBanners(req.query) });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tải banner.');
  }
}

async function getAdminArticles(req, res) {
  try {
    res.json({ items: await cmsContent.listAdminArticles(req.query) });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tải bài viết CMS.');
  }
}

async function getAdminArticle(req, res) {
  try {
    res.json({ item: await cmsContent.getAdminArticle(req.params.id) });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tải bài viết CMS.');
  }
}

async function postAdminArticle(req, res) {
  try {
    const item = await cmsContent.createArticle(req.body || {}, cmsContext(req));
    res.status(201).json({ message: 'Đã tạo bài viết.', item });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tạo bài viết.');
  }
}

async function putAdminArticle(req, res) {
  try {
    const item = await cmsContent.updateArticle(req.params.id, req.body || {}, cmsContext(req));
    res.json({ message: 'Đã cập nhật bài viết.', item });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi cập nhật bài viết.');
  }
}

async function deleteAdminArticle(req, res) {
  try {
    await cmsContent.deleteArticle(req.params.id, cmsContext(req));
    res.json({ message: 'Đã xóa bài viết.' });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi xóa bài viết.');
  }
}

async function getAdminBanners(req, res) {
  try {
    res.json({ items: await cmsContent.listAdminBanners() });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tải banner CMS.');
  }
}

async function postAdminBanner(req, res) {
  try {
    const item = await cmsContent.createBanner(req.body || {}, cmsContext(req));
    res.status(201).json({ message: 'Đã tạo banner.', item });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tạo banner.');
  }
}

async function putAdminBanner(req, res) {
  try {
    const item = await cmsContent.updateBanner(req.params.id, req.body || {}, cmsContext(req));
    res.json({ message: 'Đã cập nhật banner.', item });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi cập nhật banner.');
  }
}

async function deleteAdminBanner(req, res) {
  try {
    await cmsContent.deleteBanner(req.params.id, cmsContext(req));
    res.json({ message: 'Đã xóa banner.' });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi xóa banner.');
  }
}

async function getAdminAuditLogs(req, res) {
  try {
    res.json(await cmsContent.listAuditLogs(req.query));
  } catch (error) {
    sendCmsError(res, error, 'Lỗi tải nhật ký CMS.');
  }
}

async function postRestoreCmsVersion(req, res) {
  try {
    const item = await cmsContent.restoreFromAudit(req.params.id, cmsContext(req));
    res.json({ message: 'Đã khôi phục phiên bản CMS.', item });
  } catch (error) {
    sendCmsError(res, error, 'Lỗi khôi phục phiên bản CMS.');
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
};
