const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    trace: 'on-first-retry',
    launchOptions: {
      slowMo: 400,
    },
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
});
