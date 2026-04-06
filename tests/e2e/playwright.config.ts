import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scenarios',
  timeout: 120_000,           // 2 min per test — testnet txs can be slow
  expect: { timeout: 30_000 },
  retries: 1,                 // one retry for testnet flakiness
  workers: 1,                 // MUST be 1 — sequential to avoid nonce conflicts on real testnet
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',  // PNG saved to test-results/ on failure
    video: 'retain-on-failure',     // WebM kept in test-results/ on failure
    trace: 'retain-on-failure',     // Playwright trace ZIP on every failure (not just retry)
    headless: true,
  },
});
