const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'admin', 'dashboard.html'), 'utf8');
const cms = fs.readFileSync(path.join(root, 'js', 'website-cms.js'), 'utf8');

describe('web facade characterization', () => {
  test('khóa các DOM id CMS cần cho facade cũ', () => {
    [
      'websiteCmsTitle', 'websiteCmsIntro', 'websitePagesList',
      'websiteMediaList', 'cmsAuditList'
    ].forEach((id) => expect(html).toContain(`id="${id}"`));
  });

  test('module helper tải trước dashboard và facade', () => {
    const ordered = [
      'dashboard-router.js', 'dashboard-session.js', 'dashboard-accessibility.js',
      'website-cms-api.js', 'website-cms-router.js', 'website-cms-media.js',
      'website-cms-audit.js', 'dashboard.js', 'website-cms.js'
    ].map((name) => html.indexOf(name));
    expect(ordered.every((index) => index >= 0)).toBe(true);
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
  });

  test('giữ window.WebsiteCms và global onclick', () => {
    expect(cms).toContain('global.WebsiteCms = {');
    expect(cms).toContain('global.openWebsiteSub = openWebsiteSub');
  });
});
