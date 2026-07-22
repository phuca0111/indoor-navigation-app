/* WebsiteCmsRouter — adapter route CMS, không phụ thuộc implementation facade. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WebsiteCmsRouter = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  function normalize(sub) {
    const aliases = root.DashboardRouter?.WEBSITE_ALIASES || {
      'landing-pages': 'pages', pages: 'pages', banners: 'banner', banner: 'banner',
      articles: 'articles', media: 'media', navigation: 'navigation', seo: 'seo',
      theme: 'theme', settings: 'settings', audit: 'audit', forms: 'forms'
    };
    return aliases[sub] || 'pages';
  }

  function route(sub) {
    return { tab: 'website', websiteSub: normalize(sub) };
  }

  function href(sub) {
    return root.DashboardRouter?.href(route(sub)) ||
      '/admin/dashboard.html#website/' + encodeURIComponent(normalize(sub));
  }

  return Object.freeze({ normalize, route, href });
});
