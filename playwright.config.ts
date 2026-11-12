import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: `./artifacts/browser-tests/${Date.now()}`,
  timeout: 120_000,
  workers: 1,
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
