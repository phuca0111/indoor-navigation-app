const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // Avoid OS-specific snapshot suffixes (win32 vs linux) breaking CI.
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4178',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'node static-server.js',
    url: 'http://127.0.0.1:4178/health',
    reuseExistingServer: true
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet-chromium', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], browserName: 'chromium' } }
  ],
  outputDir: 'test-results'
});
