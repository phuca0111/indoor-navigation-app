/* Website CMS — Landing cố định (Super Admin) */
(function (global) {
  const SUBS = {
    pages: { title: 'Landing Pages', intro: '5 trang cố định — không tạo/xóa trang mới.' },
    articles: { title: 'Blog & News', intro: 'Soạn bài, SEO và xuất bản ngay hoặc theo lịch.' },
    banner: { title: 'Banner & Hero', intro: 'Quản lý banner trang chủ, hero image/video và CTA.' },
    navigation: { title: 'Navigation', intro: 'Thứ tự menu Landing. Kéo thứ tự bằng số Order.' },
    media: { title: 'Media', intro: 'Thư viện logo, icon, hình, video, PDF — tái sử dụng nhiều trang.' },
    forms: { title: 'Liên hệ', intro: 'CRM mini — xử lý yêu cầu từ Landing ngay trong hệ thống.' },
    seo: { title: 'SEO', intro: 'Meta, OG, robots, favicon và mã Analytics.' },
    theme: { title: 'Theme', intro: 'Màu, font, radius — toàn Landing đổi theo.' },
    settings: { title: 'Cài đặt Website', intro: 'Tên, logo, liên hệ và footer.' },
    audit: { title: 'Nhật ký CMS', intro: 'Lịch sử thay đổi nội dung Website, tách biệt nhật ký hệ thống.' }
  };

  let activeSub = 'pages';
  let configCache = null;
  let editingPage = null;
  let activeSectionId = null;
  let mediaItems = [];
  let mediaPage = 1;
  let mediaTotalPages = 1;
  let mediaSearchTimer = null;

  function esc(value) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(String(value ?? ''))
      : String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
  }

  async function api(path, options) {
    if (global.WebsiteCmsApi?.request) return global.WebsiteCmsApi.request(path, options);
    const response = await apiFetch('/website' + path, options || {});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || ('HTTP ' + response.status));
    return body;
  }

  function setSub(sub) {
    activeSub = SUBS[sub] ? sub : 'pages';
    window._activeWebsiteSub = activeSub;
    const meta = SUBS[activeSub];
    const title = document.getElementById('websiteCmsTitle');
    const intro = document.getElementById('websiteCmsIntro');
    if (title) title.textContent = meta.title;
    if (intro) intro.textContent = meta.intro;
    document.querySelectorAll('[data-website-panel]').forEach((panel) => {
      const on = panel.getAttribute('data-website-panel') === activeSub;
      panel.hidden = !on;
      panel.classList.toggle('is-active', on);
      panel.querySelector('.website-load-error')?.remove();
    });
    document.querySelectorAll('.website-tab-btn').forEach((btn) => {
      const on = btn.getAttribute('data-website-sub') === activeSub;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });
  }

  async function load(sub) {
    if (typeof userHasPermission === 'function' && !userHasPermission('platform.cms.manage')) {
      alert('Bạn không có quyền quản lý Website.');
      if (typeof switchTab === 'function') switchTab('overview');
      return;
    }
    setSub(sub || window._activeWebsiteSub || 'pages');
    try {
      if (activeSub === 'pages') return await loadPages();
      if (activeSub === 'articles') return await loadArticles();
      if (activeSub === 'forms') return await loadForms();
      if (activeSub === 'media') return await loadMedia();
      if (activeSub === 'audit') return await loadAudit();
      configCache = (await api('/config'));
      if (activeSub === 'banner') {
        fillBanner();
        return await loadScheduledBanners();
      }
      if (activeSub === 'navigation') renderNav();
      if (activeSub === 'seo') fillSeo();
      if (activeSub === 'theme') fillTheme();
      if (activeSub === 'settings') fillSettings();
    } catch (error) {
      console.error('WebsiteCms.load error:', error);
      const panel = document.querySelector('[data-website-panel="' + activeSub + '"]');
      if (panel) {
        panel.insertAdjacentHTML('afterbegin',
          '<div class="analytics-error website-load-error"><strong>Không tải được mục này.</strong><br>' +
          esc(error?.message || 'Lỗi không xác định') +
          '<br><button type="button" class="btn-edit" onclick="WebsiteCms.load(\'' +
          esc(activeSub) + '\')">Thử lại</button></div>');
      }
    }
  }

  async function loadPages() {
    const list = document.getElementById('websitePagesList');
    const editor = document.getElementById('websitePageEditor');
    if (editor) editor.hidden = true;
    if (list) {
      list.hidden = false;
      list.innerHTML = typeof dashUiLoading === 'function'
        ? dashUiLoading('table', { rows: 5, label: 'Đang tải trang…' })
        : 'Đang tải…';
    }
    const data = await api('/pages');
    if (!list) return;
    list.innerHTML =
      '<table class="analytics-ranking-table website-pages-table"><thead><tr>' +
      '<th>Trang</th><th>URL</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th>' +
      '</tr></thead><tbody>' +
      (data.pages || []).map((page) =>
        '<tr>' +
          '<td>' + esc(page.title) + '</td>' +
          '<td><code>' + esc(page.path) + '</code></td>' +
          '<td><span class="resource-status ' + (page.status === 'PUBLISHED' ? 'is-published' : 'is-draft') + '">' +
            (page.status === 'PUBLISHED' ? 'Đã xuất bản' : 'Nháp') + '</span></td>' +
          '<td>' + esc(page.updated_label || '') + '</td>' +
          '<td><button type="button" class="btn-edit" onclick="WebsiteCms.editPage(\'' + esc(page.slug) + '\')">Sửa</button> ' +
            '<a class="btn-edit" href="' + esc(page.path) + '" target="_blank" rel="noopener">Xem</a></td>' +
        '</tr>'
      ).join('') +
      '</tbody></table>';
  }

  async function editPage(slug) {
    const page = await api('/pages/' + encodeURIComponent(slug));
    editingPage = page;
    activeSectionId = (page.draft_sections || page.sections || [])[0]?.id || null;
    document.getElementById('websitePagesList').hidden = true;
    const editor = document.getElementById('websitePageEditor');
    editor.hidden = false;
    const status = document.getElementById('websitePageStatus');
    if (status) {
      status.textContent = page.status === 'PUBLISHED' ? 'Đã xuất bản' : 'Nháp';
      status.className = 'resource-status ' + (page.status === 'PUBLISHED' ? 'is-published' : 'is-draft');
    }
    renderSectionList();
    renderProps();
    renderPreview();
  }

  function closeEditor() {
    editingPage = null;
    document.getElementById('websitePageEditor').hidden = true;
    document.getElementById('websitePagesList').hidden = false;
    loadPages();
  }

  function sections() {
    return editingPage?.draft_sections || editingPage?.sections || [];
  }

  function activeSection() {
    return sections().find((section) => section.id === activeSectionId) || sections()[0] || null;
  }

  function renderSectionList() {
    const box = document.getElementById('websiteSectionList');
    if (!box) return;
    box.innerHTML = sections().map((section) =>
      '<button type="button" class="website-section-item' + (section.id === activeSectionId ? ' is-active' : '') + '"' +
        ' onclick="WebsiteCms.selectSection(\'' + esc(section.id) + '\')">' +
        '<strong>' + esc(section.label || section.type) + '</strong>' +
        '<span>' + (section.enabled === false ? 'Ẩn' : 'Hiện') + '</span></button>'
    ).join('');
  }

  function selectSection(id) {
    activeSectionId = id;
    renderSectionList();
    renderProps();
    renderPreview();
  }

  function renderProps() {
    const box = document.getElementById('websitePropsForm');
    const section = activeSection();
    if (!box || !section) {
      if (box) box.innerHTML = '<p class="analytics-empty">Chọn một section.</p>';
      return;
    }
    const props = section.props || {};
    const fields = Object.keys(props).length
      ? Object.keys(props)
      : ['title', 'subtitle', 'primary_cta', 'primary_href', 'image', 'background'];
    box.innerHTML =
      '<label class="website-prop-row"><span>Label</span><input data-prop-meta="label" value="' + esc(section.label || '') + '"></label>' +
      '<label class="website-prop-row"><span>Hiện section</span><select data-prop-meta="enabled">' +
        '<option value="1"' + (section.enabled !== false ? ' selected' : '') + '>Có</option>' +
        '<option value="0"' + (section.enabled === false ? ' selected' : '') + '>Không</option></select></label>' +
      fields.map((key) => {
        const value = props[key];
        if (Array.isArray(value) || (value && typeof value === 'object')) {
          return '<label class="website-prop-row"><span>' + esc(key) + ' (JSON)</span>' +
            '<textarea data-prop-key="' + esc(key) + '" data-json="1" rows="5">' + esc(JSON.stringify(value, null, 2)) + '</textarea></label>';
        }
        const multiline = String(value || '').length > 80 || key.includes('subtitle') || key.includes('text');
        return '<label class="website-prop-row"><span>' + esc(key) + '</span>' +
          (multiline
            ? '<textarea data-prop-key="' + esc(key) + '" rows="3">' + esc(value ?? '') + '</textarea>'
            : '<input data-prop-key="' + esc(key) + '" value="' + esc(value ?? '') + '">') +
          '</label>';
      }).join('') +
      '<button type="button" class="btn-edit" onclick="WebsiteCms.applyProps()">Áp dụng vào Preview</button>';
  }

  function applyProps() {
    const section = activeSection();
    if (!section) return;
    const box = document.getElementById('websitePropsForm');
    const label = box.querySelector('[data-prop-meta="label"]')?.value;
    const enabled = box.querySelector('[data-prop-meta="enabled"]')?.value !== '0';
    if (label) section.label = label;
    section.enabled = enabled;
    section.props = section.props || {};
    box.querySelectorAll('[data-prop-key]').forEach((input) => {
      const key = input.getAttribute('data-prop-key');
      if (input.getAttribute('data-json') === '1') {
        try { section.props[key] = JSON.parse(input.value || '[]'); }
        catch (_) { alert('JSON không hợp lệ: ' + key); }
      } else {
        section.props[key] = input.value;
      }
    });
    renderSectionList();
    renderPreview();
  }

  function renderPreview() {
    const box = document.getElementById('websitePreview');
    if (!box || !editingPage) return;
    box.innerHTML = sections().filter((section) => section.enabled !== false).map((section) => {
      const props = section.props || {};
      if (section.type === 'hero') {
        return '<article class="wp-hero"><p class="wp-eyebrow">' + esc(props.eyebrow || '') + '</p>' +
          '<h2>' + esc(props.title || section.label) + '</h2>' +
          '<p>' + esc(props.subtitle || '') + '</p>' +
          '<div class="wp-cta"><span>' + esc(props.primary_cta || 'CTA') + '</span></div></article>';
      }
      if (section.type === 'stats') {
        const items = Array.isArray(props.items) ? props.items : [];
        return '<article><h3>' + esc(props.title || 'Statistics') + '</h3><div class="wp-stats">' +
          items.map((item) => '<div><strong>' + esc(item.value) + '</strong><span>' + esc(item.label) + '</span></div>').join('') +
          '</div></article>';
      }
      if (section.type === 'faq') {
        const items = Array.isArray(props.items) ? props.items : [];
        return '<article><h3>' + esc(props.title || 'FAQ') + '</h3>' +
          items.map((item) => '<details><summary>' + esc(item.q) + '</summary><p>' + esc(item.a) + '</p></details>').join('') +
          '</article>';
      }
      if (section.type === 'features' || section.type === 'why') {
        const items = Array.isArray(props.items) ? props.items : [];
        return '<article><h3>' + esc(props.title || section.label) + '</h3><div class="wp-cards">' +
          items.map((item) => '<div><strong>' + esc(item.title) + '</strong><p>' + esc(item.text || '') + '</p></div>').join('') +
          '</div></article>';
      }
      return '<article><h3>' + esc(section.label) + '</h3><p>' + esc(props.text || props.subtitle || props.title || '') + '</p></article>';
    }).join('');
  }

  async function saveDraft() {
    if (!editingPage) return;
    applyProps();
    const body = await api('/pages/' + encodeURIComponent(editingPage.slug) + '/draft', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editingPage.title,
        sections: sections()
      })
    });
    editingPage = body.page;
    alert(body.message || 'Đã lưu nháp.');
    renderSectionList();
  }

  async function publishPage() {
    if (!editingPage) return;
    await saveDraft();
    const body = await api('/pages/' + encodeURIComponent(editingPage.slug) + '/publish', { method: 'POST' });
    editingPage = body.page;
    alert(body.message || 'Đã xuất bản.');
    const status = document.getElementById('websitePageStatus');
    if (status) {
      status.textContent = 'Đã xuất bản';
      status.className = 'resource-status is-published';
    }
  }

  let articleItems = [];
  let bannerItems = [];
  let auditPage = 1;

  function localDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  async function loadArticles() {
    const box = document.getElementById('cmsArticleList');
    if (box) box.innerHTML = 'Đang tải…';
    const data = await api('/articles');
    articleItems = data.items || [];
    if (!box) return;
    box.innerHTML = articleItems.length
      ? '<table class="analytics-ranking-table website-pages-table"><thead><tr>' +
        '<th>Loại</th><th>Tiêu đề</th><th>Slug</th><th>Trạng thái</th><th>Xuất bản</th><th>Thao tác</th>' +
        '</tr></thead><tbody>' +
        articleItems.map((item) =>
          '<tr><td>' + esc(item.type) + '</td><td>' + esc(item.title) + '</td>' +
          '<td><code>' + esc(item.slug) + '</code></td><td>' + esc(item.status) + '</td>' +
          '<td>' + esc(item.publish_at ? new Date(item.publish_at).toLocaleString('vi-VN') : '—') + '</td>' +
          '<td><button type="button" class="btn-edit" onclick="WebsiteCms.editArticle(\'' + esc(item._id) + '\')">Sửa</button> ' +
          '<button type="button" class="btn-logout" onclick="WebsiteCms.deleteArticle(\'' + esc(item._id) + '\')">Xóa</button></td></tr>'
        ).join('') + '</tbody></table>'
      : '<p class="analytics-empty">Chưa có bài viết.</p>';
  }

  function toggleArticleSchedule() {
    const scheduled = document.getElementById('caStatus')?.value === 'SCHEDULED';
    const wrap = document.getElementById('caScheduleWrap');
    if (wrap) wrap.hidden = !scheduled;
  }

  function resetArticleForm() {
    document.getElementById('cmsArticleForm')?.reset();
    document.getElementById('caId').value = '';
    toggleArticleSchedule();
  }

  function editArticle(id) {
    const item = articleItems.find((row) => row._id === id);
    if (!item) return;
    document.getElementById('caId').value = item._id;
    document.getElementById('caType').value = item.type;
    document.getElementById('caStatus').value = item.status;
    document.getElementById('caTitle').value = item.title || '';
    document.getElementById('caSlug').value = item.slug || '';
    document.getElementById('caImage').value = item.featured_image || '';
    document.getElementById('caPublishAt').value = localDateTime(item.publish_at);
    document.getElementById('caExcerpt').value = item.excerpt || '';
    document.getElementById('caContent').value = item.content || '';
    document.getElementById('caSeoTitle').value = item.seo?.meta_title || '';
    document.getElementById('caSeoDescription').value = item.seo?.meta_description || '';
    document.getElementById('caSeoKeywords').value = (item.seo?.keywords || []).join(', ');
    document.getElementById('caCanonical').value = item.seo?.canonical_url || '';
    document.getElementById('caOgImage').value = item.seo?.og_image || '';
    toggleArticleSchedule();
    document.getElementById('cmsArticleForm')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveArticle(event) {
    event.preventDefault();
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;
    const id = document.getElementById('caId').value;
    const publishValue = document.getElementById('caPublishAt').value;
    const payload = {
      type: document.getElementById('caType').value,
      status: document.getElementById('caStatus').value,
      title: document.getElementById('caTitle').value,
      slug: document.getElementById('caSlug').value,
      featured_image: document.getElementById('caImage').value,
      publish_at: publishValue ? new Date(publishValue).toISOString() : null,
      excerpt: document.getElementById('caExcerpt').value,
      content: document.getElementById('caContent').value,
      seo: {
        meta_title: document.getElementById('caSeoTitle').value,
        meta_description: document.getElementById('caSeoDescription').value,
        keywords: document.getElementById('caSeoKeywords').value,
        canonical_url: document.getElementById('caCanonical').value,
        og_image: document.getElementById('caOgImage').value
      }
    };
    try {
      await api(id ? '/articles/' + encodeURIComponent(id) : '/articles', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      resetArticleForm();
      await loadArticles();
      alert(id ? 'Đã cập nhật bài viết.' : 'Đã lưu bài viết mới.');
    } catch (error) {
      alert('Không thể lưu bài viết: ' + (error?.message || 'Lỗi không xác định'));
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
    return false;
  }

  async function deleteArticle(id) {
    if (!confirm('Xóa bài viết này?')) return;
    await api('/articles/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadArticles();
  }

  function fillBanner() {
    const banner = configCache?.banner || {};
    document.getElementById('wbTitle').value = banner.homepage_title || '';
    document.getElementById('wbSubtitle').value = banner.homepage_subtitle || '';
    document.getElementById('wbImage').value = banner.hero_image || '';
    document.getElementById('wbVideo').value = banner.hero_video || '';
    document.getElementById('wbCtaLabel').value = banner.cta_label || '';
    document.getElementById('wbCtaHref').value = banner.cta_href || '';
    document.getElementById('wbBackground').value = banner.background || '';
  }

  async function saveBanner(event) {
    event.preventDefault();
    const videoUrl = document.getElementById('wbVideo').value.trim();
    if (
      videoUrl &&
      !/(youtube\.com|youtube-nocookie\.com|youtu\.be)/i.test(videoUrl) &&
      !/\.(mp4|webm|ogg)(\?.*)?$/i.test(videoUrl)
    ) {
      alert('Hero Video chỉ hỗ trợ URL YouTube hoặc file .mp4, .webm, .ogg.');
      return false;
    }
    await api('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        banner: {
          homepage_title: document.getElementById('wbTitle').value,
          homepage_subtitle: document.getElementById('wbSubtitle').value,
          hero_image: document.getElementById('wbImage').value,
          hero_video: videoUrl,
          cta_label: document.getElementById('wbCtaLabel').value,
          cta_href: document.getElementById('wbCtaHref').value,
          background: document.getElementById('wbBackground').value
        }
      })
    });
    alert('Đã lưu Banner & Hero.');
    return false;
  }

  async function loadScheduledBanners() {
    const data = await api('/banners');
    bannerItems = data.items || [];
    const box = document.getElementById('cmsBannerList');
    if (!box) return;
    box.innerHTML = bannerItems.length
      ? '<table class="analytics-ranking-table website-pages-table"><thead><tr>' +
        '<th>Tên</th><th>Vị trí</th><th>Hiển thị</th><th>Lịch</th><th>Thao tác</th></tr></thead><tbody>' +
        bannerItems.map((item) => {
          const now = Date.now();
          const startsAt = item.starts_at ? new Date(item.starts_at).getTime() : null;
          const endsAt = item.ends_at ? new Date(item.ends_at).getTime() : null;
          let displayStatus = 'Đang hiển thị';
          let statusClass = 'is-published';
          if (!item.enabled) {
            displayStatus = 'Đang tắt';
            statusClass = 'is-draft';
          } else if (startsAt && startsAt > now) {
            displayStatus = 'Chưa tới giờ';
            statusClass = 'is-draft';
          } else if (endsAt && endsAt <= now) {
            displayStatus = 'Đã hết hạn';
            statusClass = 'is-draft';
          }
          return (
          '<tr><td>' + esc(item.name) + '</td><td>' + esc(item.placement) + '</td>' +
          '<td><span class="resource-status ' + statusClass + '">' + displayStatus + '</span></td>' +
          '<td>' + esc(item.starts_at ? new Date(item.starts_at).toLocaleString('vi-VN') : 'Ngay') +
          ' → ' + esc(item.ends_at ? new Date(item.ends_at).toLocaleString('vi-VN') : 'Không giới hạn') + '</td>' +
          '<td><button type="button" class="btn-edit" onclick="WebsiteCms.editScheduledBanner(\'' + esc(item._id) + '\')">Sửa</button> ' +
          '<button type="button" class="btn-logout" onclick="WebsiteCms.deleteScheduledBanner(\'' + esc(item._id) + '\')">Xóa</button></td></tr>'
          );
        }).join('') + '</tbody></table>'
      : '<p class="analytics-empty">Chưa có banner theo lịch.</p>';
  }

  function editScheduledBanner(id) {
    const item = bannerItems.find((row) => row._id === id);
    if (!item) return;
    document.getElementById('cbId').value = item._id;
    document.getElementById('cbName').value = item.name || '';
    document.getElementById('cbPlacement').value = item.placement || 'HOME';
    document.getElementById('cbTitle').value = item.title || '';
    document.getElementById('cbSubtitle').value = item.subtitle || '';
    document.getElementById('cbImage').value = item.image_url || '';
    document.getElementById('cbLink').value = item.link_url || '';
    document.getElementById('cbStarts').value = localDateTime(item.starts_at);
    document.getElementById('cbEnds').value = localDateTime(item.ends_at);
    document.getElementById('cbPriority').value = item.priority || 0;
    document.getElementById('cbEnabled').checked = item.enabled !== false;
  }

  async function saveScheduledBanner(event) {
    event.preventDefault();
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;
    const id = document.getElementById('cbId').value;
    const starts = document.getElementById('cbStarts').value;
    const ends = document.getElementById('cbEnds').value;
    try {
      await api(id ? '/banners/' + encodeURIComponent(id) : '/banners', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('cbName').value,
          placement: document.getElementById('cbPlacement').value,
          title: document.getElementById('cbTitle').value,
          subtitle: document.getElementById('cbSubtitle').value,
          image_url: document.getElementById('cbImage').value,
          link_url: document.getElementById('cbLink').value,
          starts_at: starts ? new Date(starts).toISOString() : null,
          ends_at: ends ? new Date(ends).toISOString() : null,
          priority: Number(document.getElementById('cbPriority').value) || 0,
          enabled: document.getElementById('cbEnabled').checked
        })
      });
      event.target.reset();
      document.getElementById('cbId').value = '';
      document.getElementById('cbEnabled').checked = true;
      await loadScheduledBanners();
      alert(id ? 'Đã cập nhật banner lịch.' : 'Đã lưu banner lịch.');
    } catch (error) {
      alert('Không thể lưu banner: ' + (error?.message || 'Lỗi không xác định'));
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
    return false;
  }

  async function deleteScheduledBanner(id) {
    if (!confirm('Xóa banner này?')) return;
    await api('/banners/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadScheduledBanners();
  }

  function renderNav() {
    const list = document.getElementById('websiteNavList');
    const items = [...(configCache?.navigation || [])].sort((a, b) => a.order - b.order);
    list.innerHTML = items.map((item, index) =>
      '<div class="website-nav-item" data-index="' + index + '">' +
        '<input data-nav="label" value="' + esc(item.label) + '">' +
        '<input data-nav="href" value="' + esc(item.href) + '">' +
        '<input data-nav="order" type="number" value="' + esc(item.order) + '" style="width:80px">' +
        '<label><input data-nav="enabled" type="checkbox"' + (item.enabled !== false ? ' checked' : '') + '> Hiện</label>' +
        '<button type="button" class="btn-logout" onclick="WebsiteCms.removeNavItem(' + index + ')">Xóa</button>' +
      '</div>'
    ).join('') || '<p class="analytics-empty">Chưa có mục menu.</p>';
  }

  function collectNav() {
    return Array.from(document.querySelectorAll('.website-nav-item')).map((row, index) => ({
      id: 'nav-' + index,
      label: row.querySelector('[data-nav="label"]').value,
      href: safeNavigationHref(row.querySelector('[data-nav="href"]').value),
      order: Number(row.querySelector('[data-nav="order"]').value) || index + 1,
      enabled: row.querySelector('[data-nav="enabled"]').checked
    }));
  }

  function safeNavigationHref(value) {
    const href = String(value || '').trim();
    return /^(\/(?!\/)|#|https?:\/\/)/i.test(href) ? href : '#';
  }

  function addNavItem() {
    configCache = configCache || {};
    configCache.navigation = collectNav();
    configCache.navigation.push({
      id: 'nav-' + Date.now(),
      label: 'Mục mới',
      href: '/',
      order: configCache.navigation.length + 1,
      enabled: true
    });
    renderNav();
  }

  function removeNavItem(index) {
    configCache.navigation = collectNav().filter((_, i) => i !== index);
    renderNav();
  }

  async function saveNavigation() {
    const body = await api('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navigation: collectNav() })
    });
    configCache = body.config;
    alert(body.message || 'Đã lưu menu.');
    renderNav();
  }

  async function loadMedia(page) {
    mediaPage = Math.max(1, Number(page) || mediaPage || 1);
    const q = document.getElementById('wmSearch')?.value || '';
    const data = await api('/media?page=' + mediaPage + '&limit=24&q=' + encodeURIComponent(q));
    mediaItems = data.items || [];
    const paging = global.WebsiteCmsMedia?.pagination
      ? global.WebsiteCmsMedia.pagination(mediaPage, data.total_pages)
      : { page: mediaPage, totalPages: Number(data.total_pages) || 1 };
    mediaPage = paging.page;
    mediaTotalPages = paging.totalPages;
    const box = document.getElementById('websiteMediaList');
    box.innerHTML = mediaItems.length
      ? '<div class="website-media-grid">' + mediaItems.map((item) =>
          '<article>' + ((global.WebsiteCmsMedia?.isImage?.(item) ?? String(item.mime || '').startsWith('image/'))
            ? '<img src="' + esc(item.url) + '" alt="' + esc(item.alt || '') + '" loading="lazy" style="max-width:100%;height:100px;object-fit:cover">'
            : '') + '<strong>' + esc(item.name) + '</strong><span>' + esc(item.kind) + '</span>' +
          '<a href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(item.url) + '</a>' +
          '<select aria-label="Chọn vị trí dùng media" onchange="WebsiteCms.useMedia(\'' + esc(item._id) + '\',this.value);this.value=\'\'">' +
            '<option value="">Dùng cho…</option><option value="caImage">Ảnh bài viết</option>' +
            '<option value="caOgImage">OG bài viết</option><option value="wbImage">Hero</option>' +
            '<option value="cbImage">Banner</option><option value="wsetLogo">Logo</option>' +
            '<option value="wsFavicon">Favicon</option></select>' +
          '<button type="button" class="btn-logout" onclick="WebsiteCms.removeMedia(\'' + esc(item._id) + '\')">Xóa</button></article>'
        ).join('') + '</div><div class="website-audit-pagination">' +
          '<button type="button" class="btn-edit" onclick="WebsiteCms.loadMedia(' + (mediaPage - 1) + ')"' +
          (mediaPage <= 1 ? ' disabled' : '') + '>← Trước</button><span>Trang ' + mediaPage + ' / ' + mediaTotalPages + '</span>' +
          '<button type="button" class="btn-edit" onclick="WebsiteCms.loadMedia(' + (mediaPage + 1) + ')"' +
          (mediaPage >= mediaTotalPages ? ' disabled' : '') + '>Sau →</button></div>'
      : '<p class="analytics-empty">Chưa có media.</p>';
  }

  async function addMedia(event) {
    event.preventDefault();
    const file = document.getElementById('wmFile').files[0];
    const url = document.getElementById('wmUrl').value.trim();
    if (!file && !url) {
      alert('Chọn file hoặc nhập URL fallback.');
      return false;
    }
    if (file) await uploadMediaFile(file);
    else {
      await api('/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('wmName').value,
          url,
          kind: document.getElementById('wmKind').value,
          alt: document.getElementById('wmAlt').value
        })
      });
    }
    event.target.reset();
    await loadMedia(1);
    return false;
  }

  function uploadMediaFile(file) {
    const progress = document.getElementById('wmProgress');
    const status = document.getElementById('wmUploadStatus');
    const form = new FormData();
    form.append('file', file);
    form.append('name', document.getElementById('wmName').value || file.name);
    form.append('kind', document.getElementById('wmKind').value);
    form.append('alt', document.getElementById('wmAlt').value);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', API_URL + '/website/media');
      const token = localStorage.getItem('token');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      progress.hidden = false;
      progress.value = 0;
      status.textContent = 'Đang upload…';
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) progress.value = Math.round(event.loaded * 100 / event.total);
      };
      xhr.onload = () => {
        const body = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          progress.value = 100;
          status.textContent = 'Upload thành công.';
          resolve(body);
        } else {
          status.textContent = body.message || 'Upload thất bại.';
          reject(new Error(status.textContent));
        }
      };
      xhr.onerror = () => {
        status.textContent = 'Mất kết nối khi upload.';
        reject(new Error(status.textContent));
      };
      xhr.send(form);
    });
  }

  function searchMedia() {
    clearTimeout(mediaSearchTimer);
    mediaSearchTimer = setTimeout(() => loadMedia(1), 250);
  }

  function useMedia(id, targetId) {
    if (!targetId) return;
    const item = mediaItems.find((row) => row._id === id);
    const input = document.getElementById(targetId);
    if (!item || !input) return;
    if (!String(item.alt || '').trim()) {
      alert('Media dùng trong nội dung phải có Alt.');
      return;
    }
    input.value = item.url;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function removeMedia(id) {
    if (!confirm('Xóa media này?')) return;
    await api('/media/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadMedia();
  }

  let contactFilter = 'ALL';
  let contactItems = [];
  let selectedContactId = null;
  let contactPollTimer = null;

  async function contactApi(path, options) {
    const response = await apiFetch('/contact' + path, options || {});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || ('HTTP ' + response.status));
    return body;
  }

  async function refreshContactBadge() {
    if (typeof userHasPermission === 'function' && !userHasPermission('platform.contacts.manage')) return;
    try {
      const data = await contactApi('/unread-count');
      const badge = document.getElementById('websiteContactBadge');
      const count = Number(data.count) || 0;
      if (badge) {
        badge.hidden = count <= 0;
        badge.textContent = String(count);
      }
      if (count > 0 && window._contactBadgeLast != null && count > window._contactBadgeLast) {
        const newest = contactItems[0];
        if (typeof window.AdminUI?.toast === 'function') {
          window.AdminUI.toast({
            title: 'Có liên hệ mới',
            message: newest ? (newest.full_name + ' · ' + newest.subject) : (count + ' yêu cầu mới'),
            type: 'info'
          });
        }
      }
      window._contactBadgeLast = count;
    } catch (_) { /* ignore */ }
  }

  function startContactPolling() {
    if (
      contactPollTimer ||
      (typeof userHasPermission === 'function' && !userHasPermission('platform.contacts.manage'))
    ) return;
    refreshContactBadge();
    contactPollTimer = setInterval(refreshContactBadge, 45000);
  }

  async function loadForms() {
    startContactPolling();
    const list = document.getElementById('websiteContactList');
    const stats = document.getElementById('websiteContactStats');
    const filters = document.getElementById('websiteContactFilters');
    if (list) list.innerHTML = 'Đang tải…';
    const type = document.getElementById('websiteContactTypeFilter')?.value || 'ALL';
    const q = document.getElementById('websiteContactSearch')?.value || '';
    const data = await contactApi(
      '/?status=' + encodeURIComponent(contactFilter) +
      '&request_type=' + encodeURIComponent(type) +
      '&q=' + encodeURIComponent(q) +
      '&limit=50'
    );
    contactItems = data.items || [];
    const counts = data.status_counts || {};
    if (filters) {
      filters.innerHTML = [
        ['ALL', 'Tất cả'],
        ['NEW', 'Mới'],
        ['IN_PROGRESS', 'Đang xử lý'],
        ['REPLIED', 'Đã phản hồi'],
        ['CLOSED', 'Đã đóng'],
        ['SPAM', 'Spam']
      ].map(([key, label]) =>
        '<button type="button" class="website-contact-filter' + (contactFilter === key ? ' is-active' : '') + '"' +
          ' onclick="WebsiteCms.setContactFilter(\'' + key + '\')">' + label +
          ' <b>' + (counts[key] || 0) + '</b></button>'
      ).join('');
    }
    if (stats) {
      stats.innerHTML =
        '<article><strong>' + (counts.NEW || 0) + '</strong><span>Mới</span></article>' +
        '<article><strong>' + (counts.IN_PROGRESS || 0) + '</strong><span>Đang xử lý</span></article>' +
        '<article><strong>' + (counts.REPLIED || 0) + '</strong><span>Đã phản hồi</span></article>' +
        '<article><strong>' + (counts.CLOSED || 0) + '</strong><span>Đã đóng</span></article>';
    }
    if (!list) return;
    if (!contactItems.length) {
      list.innerHTML = '<p class="analytics-empty">Chưa có liên hệ.</p>';
    } else {
      list.innerHTML = contactItems.map((item, index) =>
        '<button type="button" class="website-contact-row status-' + esc(item.status) +
          (item.id === selectedContactId ? ' is-active' : '') + '"' +
          ' onclick="WebsiteCms.openContact(\'' + esc(item.id) + '\')">' +
          '<span class="website-contact-idx">' + (index + 1) + '</span>' +
          '<span class="website-contact-main">' +
            '<strong>' + esc(item.full_name) + '</strong>' +
            '<small>' + esc(item.company || item.email) + ' · ' + esc(item.subject) + '</small>' +
          '</span>' +
          '<span class="website-contact-meta">' +
            '<i class="crm-status crm-' + esc(item.status) + '">' + esc(item.status_label) + '</i>' +
            '<time>' + esc(item.created_label) + '</time>' +
          '</span></button>'
      ).join('');
    }
    refreshContactBadge();
    if (selectedContactId) openContact(selectedContactId);
  }

  function setContactFilter(status) {
    contactFilter = status || 'ALL';
    loadForms();
  }

  function filterContacts() {
    loadForms();
  }

  async function openContact(id) {
    selectedContactId = id;
    const detail = document.getElementById('websiteContactDetail');
    if (detail) detail.innerHTML = 'Đang tải…';
    const data = await contactApi('/' + encodeURIComponent(id));
    const item = data.item;
    document.querySelectorAll('.website-contact-row').forEach((row) => {
      row.classList.toggle('is-active', row.getAttribute('onclick')?.includes(id));
    });
    if (!detail) return;
    detail.innerHTML =
      '<div class="website-contact-detail-head">' +
        '<div><h3>' + esc(item.full_name) + '</h3><p>' + esc(item.subject) + '</p></div>' +
        '<i class="crm-status crm-' + esc(item.status) + '">' + esc(item.status_label) + '</i>' +
      '</div>' +
      '<div class="website-contact-actions">' +
        '<button type="button" class="btn-create" onclick="WebsiteCms.openReplyModal()">Reply</button>' +
        '<button type="button" class="btn-edit" onclick="WebsiteCms.setContactStatus(\'IN_PROGRESS\')">Đang xử lý</button>' +
        '<button type="button" class="btn-edit" onclick="WebsiteCms.assignToMe()">Assign cho tôi</button>' +
        '<button type="button" class="btn-edit" onclick="WebsiteCms.setContactStatus(\'CLOSED\')">Close</button>' +
        '<button type="button" class="btn-logout" onclick="WebsiteCms.setContactStatus(\'SPAM\')">Spam</button>' +
        '<button type="button" class="btn-logout" onclick="WebsiteCms.deleteContact()">Delete</button>' +
      '</div>' +
      '<section><h4>Thông tin</h4><dl class="website-contact-dl">' +
        [['Họ tên', item.full_name], ['Email', item.email], ['SĐT', item.phone || '—'],
          ['Công ty', item.company || '—'], ['Website', item.website || '—'],
          ['Loại', item.request_type_label], ['IP', item.ip_address || '—'],
          ['Ngày gửi', item.created_label], ['Nguồn', item.source || 'landing'],
          ['User Agent', item.user_agent || '—'],
          ['Người xử lý', item.assigned_to?.name || '—']
        ].map((row) => '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>').join('') +
      '</dl></section>' +
      '<section><h4>Nội dung</h4><p class="website-contact-message">' + esc(item.message) + '</p></section>' +
      '<section><h4>Ghi chú nội bộ</h4>' +
        '<textarea id="websiteContactNote" rows="3">' + esc(item.note || '') + '</textarea>' +
        '<button type="button" class="btn-edit" style="margin-top:8px" onclick="WebsiteCms.saveContactNote()">Lưu ghi chú</button>' +
      '</section>' +
      '<section><h4>Lịch sử</h4><ul class="website-contact-history">' +
        (item.history || []).slice().reverse().map((h) =>
          '<li><time>' + esc(h.at_label) + '</time><strong>' + esc(h.action) + '</strong>' +
          '<span>' + esc(h.detail || h.actor_name || '') + '</span></li>'
        ).join('') +
      '</ul></section>';
  }

  async function setContactStatus(status) {
    if (!selectedContactId) return;
    await contactApi('/' + encodeURIComponent(selectedContactId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    await loadForms();
  }

  async function assignToMe() {
    if (!selectedContactId || !currentUser) return;
    await contactApi('/' + encodeURIComponent(selectedContactId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: currentUser.id || currentUser._id })
    });
    await loadForms();
  }

  async function saveContactNote() {
    if (!selectedContactId) return;
    const note = document.getElementById('websiteContactNote')?.value || '';
    await contactApi('/' + encodeURIComponent(selectedContactId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    await openContact(selectedContactId);
  }

  function openReplyModal() {
    const item = contactItems.find((row) => row.id === selectedContactId);
    if (!item) return;
    document.getElementById('contactReplyTo').value = item.email;
    document.getElementById('contactReplySubject').value = 'Re: ' + (item.subject || 'Liên hệ IndoorNav');
    document.getElementById('contactReplyBody').value =
      'Xin chào ' + (item.full_name || 'anh/chị') + ',\n\n' +
      'Cảm ơn anh/chị đã liên hệ IndoorNav.\n\n' +
      'Trân trọng,\nĐội ngũ IndoorNav';
    document.getElementById('contactReplyModal').style.display = 'flex';
  }

  function closeReplyModal() {
    const modal = document.getElementById('contactReplyModal');
    if (modal) modal.style.display = 'none';
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!selectedContactId) return false;
    await contactApi('/' + encodeURIComponent(selectedContactId) + '/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: document.getElementById('contactReplySubject').value,
        body: document.getElementById('contactReplyBody').value
      })
    });
    closeReplyModal();
    alert('Đã lưu phản hồi.');
    await loadForms();
    return false;
  }

  async function deleteContact() {
    if (!selectedContactId || !confirm('Xóa yêu cầu liên hệ này?')) return;
    await contactApi('/' + encodeURIComponent(selectedContactId), { method: 'DELETE' });
    selectedContactId = null;
    document.getElementById('websiteContactDetail').innerHTML =
      '<p class="analytics-empty">Chọn một liên hệ để xem chi tiết.</p>';
    await loadForms();
  }

  function fillSeo() {
    const seo = configCache?.seo || {};
    document.getElementById('wsTitle').value = seo.meta_title || '';
    document.getElementById('wsDescription').value = seo.description || '';
    document.getElementById('wsOg').value = seo.og_image || '';
    document.getElementById('wsKeywords').value = seo.keywords || '';
    document.getElementById('wsRobots').value = seo.robots || '';
    document.getElementById('wsFavicon').value = seo.favicon || '';
    document.getElementById('wsAnalytics').value = seo.analytics_code || '';
  }

  async function saveSeo(event) {
    event.preventDefault();
    const analyticsCode = document.getElementById('wsAnalytics').value.trim();
    if (analyticsCode && !/\bG-[A-Z0-9]+\b/i.test(analyticsCode)) {
      alert('Google Analytics cần Measurement ID hợp lệ, ví dụ G-XXXXXXXXXX.');
      return false;
    }
    await api('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seo: {
          meta_title: document.getElementById('wsTitle').value,
          description: document.getElementById('wsDescription').value,
          og_image: document.getElementById('wsOg').value,
          keywords: document.getElementById('wsKeywords').value,
          robots: document.getElementById('wsRobots').value,
          favicon: document.getElementById('wsFavicon').value,
          analytics_code: analyticsCode
        }
      })
    });
    alert('Đã lưu SEO.');
    return false;
  }

  function fillTheme() {
    const theme = configCache?.theme || {};
    document.getElementById('wtPrimary').value = theme.primary || '#2563eb';
    document.getElementById('wtSecondary').value = theme.secondary || '#0f172a';
    document.getElementById('wtMode').value = theme.mode || 'light';
    document.getElementById('wtFont').value = theme.font || '';
    document.getElementById('wtRadius').value = theme.radius || '12px';
  }

  async function saveTheme(event) {
    event.preventDefault();
    await api('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme: {
          primary: document.getElementById('wtPrimary').value,
          secondary: document.getElementById('wtSecondary').value,
          mode: document.getElementById('wtMode').value,
          font: document.getElementById('wtFont').value,
          radius: document.getElementById('wtRadius').value
        }
      })
    });
    alert('Đã lưu Theme.');
    return false;
  }

  function fillSettings() {
    const settings = configCache?.settings || {};
    document.getElementById('wsetName').value = settings.site_name || '';
    document.getElementById('wsetLogo').value = settings.logo_url || '';
    document.getElementById('wsetEmail').value = settings.email || '';
    document.getElementById('wsetHotline').value = settings.hotline || '';
    document.getElementById('wsetFacebook').value = settings.facebook || '';
    document.getElementById('wsetYoutube').value = settings.youtube || '';
    document.getElementById('wsetMap').value = settings.google_map || '';
    document.getElementById('wsetFooter').value = settings.footer_text || '';
  }

  async function saveSettings(event) {
    event.preventDefault();
    await api('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          site_name: document.getElementById('wsetName').value,
          logo_url: document.getElementById('wsetLogo').value,
          email: document.getElementById('wsetEmail').value,
          hotline: document.getElementById('wsetHotline').value,
          facebook: document.getElementById('wsetFacebook').value,
          youtube: document.getElementById('wsetYoutube').value,
          google_map: document.getElementById('wsetMap').value,
          footer_text: document.getElementById('wsetFooter').value
        }
      })
    });
    alert('Đã lưu cài đặt Website.');
    return false;
  }

  async function loadAudit(page) {
    auditPage = Math.max(1, Number(page) || auditPage || 1);
    const box = document.getElementById('cmsAuditList');
    if (box) box.innerHTML = 'Đang tải…';
    const data = await api('/audit-logs?limit=20&page=' + auditPage);
    if (!box) return;
    const rows = data.items || [];
    const table = rows.length
      ? '<table class="analytics-ranking-table website-pages-table"><thead><tr>' +
        '<th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Nhãn</th><th>Thao tác</th></tr></thead><tbody>' +
        rows.map((item) =>
          '<tr><td>' + esc(global.WebsiteCmsAudit?.date?.(item.createdAt) || new Date(item.createdAt).toLocaleString('vi-VN')) + '</td>' +
          '<td>' + esc(global.WebsiteCmsAudit?.actor?.(item) || item.actor_id?.full_name || item.actor_id?.email || item.actor_id?._id || '—') + '</td>' +
          '<td>' + esc(item.action) + '</td><td>' + esc(item.resource_type) + '</td>' +
          '<td>' + esc(item.resource_label || item.resource_id) + '</td>' +
          '<td>' + ((global.WebsiteCmsAudit?.canRestore?.(item) ?? (item.after || item.before))
            ? '<button type="button" class="btn-edit" onclick="WebsiteCms.restoreVersion(\'' +
              esc(item._id) + '\')">Khôi phục</button>'
            : '—') + '</td></tr>'
        ).join('') + '</tbody></table>'
      : '<p class="analytics-empty">Chưa có thay đổi CMS.</p>';
    const totalPages = Math.max(1, Number(data.total_pages) || 1);
    auditPage = Math.min(auditPage, totalPages);
    const pagination =
      '<div class="website-audit-pagination">' +
        '<button type="button" class="btn-edit" onclick="WebsiteCms.loadAudit(' + (auditPage - 1) + ')"' +
          (auditPage <= 1 ? ' disabled' : '') + '>← Trang trước</button>' +
        '<span>Trang ' + auditPage + ' / ' + totalPages + ' · ' + (Number(data.total) || 0) + ' bản ghi</span>' +
        '<button type="button" class="btn-edit" onclick="WebsiteCms.loadAudit(' + (auditPage + 1) + ')"' +
          (auditPage >= totalPages ? ' disabled' : '') + '>Trang sau →</button>' +
      '</div>';
    box.innerHTML = table + pagination;
  }

  async function restoreVersion(id) {
    if (!confirm(
      'Khôi phục dữ liệu về đúng phiên bản này? Dữ liệu hiện tại của đối tượng sẽ được thay thế.'
    )) return;
    try {
      const result = await api('/audit-logs/' + encodeURIComponent(id) + '/restore', {
        method: 'POST'
      });
      alert(result.message || 'Đã khôi phục phiên bản CMS.');
      await loadAudit(auditPage);
    } catch (error) {
      alert('Không thể khôi phục: ' + (error?.message || 'Lỗi không xác định'));
    }
  }

  async function openWebsiteSub(sub) {
    sub = global.WebsiteCmsRouter?.normalize?.(sub) || sub;
    if (typeof switchTab === 'function') {
      await switchTab('website', { websiteSub: sub });
    } else {
      window._activeWebsiteSub = sub;
      await load(sub);
    }
  }

  global.WebsiteCms = {
    load,
    openWebsiteSub,
    editPage,
    closeEditor,
    selectSection,
    applyProps,
    saveDraft,
    publishPage,
    loadArticles,
    editArticle,
    saveArticle,
    deleteArticle,
    resetArticleForm,
    toggleArticleSchedule,
    saveBanner,
    loadScheduledBanners,
    editScheduledBanner,
    saveScheduledBanner,
    deleteScheduledBanner,
    addNavItem,
    removeNavItem,
    saveNavigation,
    loadMedia,
    addMedia,
    searchMedia,
    useMedia,
    removeMedia,
    saveSeo,
    saveTheme,
    saveSettings,
    loadAudit,
    restoreVersion,
    loadForms,
    setContactFilter,
    filterContacts,
    openContact,
    setContactStatus,
    assignToMe,
    saveContactNote,
    openReplyModal,
    closeReplyModal,
    sendReply,
    deleteContact,
    refreshContactBadge,
    startContactPolling
  };
  global.openWebsiteSub = openWebsiteSub;
})(window);
