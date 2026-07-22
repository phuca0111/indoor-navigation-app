const router = require('../../js/dashboard-router');

describe('DashboardRouter web-quality', () => {
  test.each([
    ['#website', 'pages'],
    ['#website/pages', 'pages'],
    ['#website/landing-pages', 'pages'],
    ['#website/articles', 'articles'],
    ['#website/banners', 'banner'],
    ['#website/media', 'media'],
    ['#website/navigation', 'navigation'],
    ['#website/seo', 'seo'],
    ['#website/theme', 'theme'],
    ['#website/settings', 'settings'],
    ['#website/audit', 'audit']
  ])('parse %s', (hash, expected) => {
    expect(router.parse(hash)).toEqual({ tab: 'website', websiteSub: expected });
  });

  test('serializer tạo deep route ổn định', () => {
    expect(router.serialize({ tab: 'website', websiteSub: 'media' })).toBe('#website/media');
    expect(router.href({ tab: 'overview' })).toBe('/admin/dashboard.html#overview');
  });

  test('CMS route không hợp lệ fallback pages', () => {
    expect(router.parse('#website/javascript:alert(1)')).toEqual({
      tab: 'website',
      websiteSub: 'pages'
    });
  });
});
