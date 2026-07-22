/* DashboardRouter — parser/serializer thuần, dùng được trong browser và Jest. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DashboardRouter = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const WEBSITE_ALIASES = Object.freeze({
    'landing-pages': 'pages',
    pages: 'pages',
    articles: 'articles',
    banners: 'banner',
    banner: 'banner',
    media: 'media',
    navigation: 'navigation',
    seo: 'seo',
    theme: 'theme',
    settings: 'settings',
    audit: 'audit',
    forms: 'forms'
  });

  const WEBSITE_TITLES = Object.freeze({
    pages: 'Landing Pages',
    articles: 'Blog & News',
    banner: 'Banner & Hero',
    media: 'Media',
    navigation: 'Navigation',
    seo: 'SEO',
    theme: 'Theme',
    settings: 'Cài đặt Website',
    audit: 'Nhật ký CMS',
    forms: 'Liên hệ'
  });

  function clean(value) {
    try {
      return decodeURIComponent(String(value || '').trim().replace(/^#\/?/, ''));
    } catch (_) {
      return '';
    }
  }

  function parse(hash) {
    const parts = clean(hash).split('/').filter(Boolean);
    const tab = parts[0] || 'overview';
    if (tab !== 'website') return { tab, websiteSub: null };
    return {
      tab: 'website',
      websiteSub: WEBSITE_ALIASES[parts[1]] || 'pages'
    };
  }

  function serialize(route) {
    const tab = String(route?.tab || 'overview');
    if (tab !== 'website') return '#' + encodeURIComponent(tab);
    const sub = WEBSITE_ALIASES[route?.websiteSub] || 'pages';
    return '#website/' + encodeURIComponent(sub);
  }

  function href(route) {
    return '/admin/dashboard.html' + serialize(route);
  }

  function title(route) {
    if (route?.tab === 'website') {
      return (WEBSITE_TITLES[WEBSITE_ALIASES[route.websiteSub] || 'pages'] || 'Website') + ' | IndoorNav Admin';
    }
    return 'IndoorNav Admin | ' + String(route?.tab || 'overview');
  }

  return Object.freeze({ WEBSITE_ALIASES, WEBSITE_TITLES, parse, serialize, href, title });
});
