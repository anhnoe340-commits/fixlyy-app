import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], baseURL: 'https://app.fixlyy.fr' } },
    { name: 'chromium-mobile',  use: { ...devices['iPhone 14'],      baseURL: 'https://app.fixlyy.fr' } },
    { name: 'website',          use: { ...devices['Desktop Chrome'], baseURL: 'https://fixlyy.fr' } },
  ],
});
