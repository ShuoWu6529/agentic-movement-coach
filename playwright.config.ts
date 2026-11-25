// Playwright (PLANS.md §1, §8 M1): fake-camera smoke test, camera permission denied, and log download.
// Runs against the production build (`npm run build` first), served by `vite preview`.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4179;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
