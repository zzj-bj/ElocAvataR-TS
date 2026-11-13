import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('loads a real VRM, renders motion, imports models, and runs local inference with a synthetic camera', async ({ page }) => {
  await page.addInitScript(() => {
    const stats = { submitted: 0, completed: 0, inFlight: 0, maxInFlight: 0, terminated: 0 };
    (window as unknown as { workerStats: typeof stats }).workerStats = stats;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => {
          if (event.data.type === 'result') { stats.completed++; stats.inFlight--; }
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        if (message && typeof message === 'object' && 'type' in message && message.type === 'frame') {
          stats.submitted++; stats.inFlight++;
          stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
        }
        if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
      override terminate(): void { stats.terminated++; super.terminate(); }
    };
  });
  const errors: string[] = [];
  const external: string[] = [];
  const assets: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    assets.push(request.url());
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5174')) external.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('app-root')).toHaveAttribute('ng-version', /^22\./);
  await expect(page.locator('#notice')).toContainText('Ready.', { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.locator('body').innerText()).not.toMatch(/\p{Script=Han}/u);
  expect(await page.locator('[aria-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')).join(' '))).not.toMatch(/\p{Script=Han}/u);
  await expect(page.locator('#avatar-view canvas')).toBeVisible();
  await expect(page.locator('#model-name')).toContainText('pixiv');
  const initial = await page.locator('#avatar-view canvas').screenshot();
  await page.locator('#demo').click();
  await expect(page.locator('#mode')).toHaveText('Synthetic demo');
  await expect(page.locator('#left-state')).toHaveText('Tracked');
  await page.waitForTimeout(1000);
  const animated = await page.locator('#avatar-view canvas').screenshot();
  expect(animated.equals(initial)).toBe(false);
  await page.screenshot({ path: 'artifacts/desktop-demo.png', fullPage: true });
  await page.getByRole('button', { name: 'Left hand', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Left hand', exact: true })).toHaveClass('selected');
  await page.screenshot({ path: 'artifacts/left-hand-demo.png', fullPage: true });
  await page.getByRole('button', { name: '↺ Reset view' }).click();
  await page.locator('#demo').click();

  // A malformed import must preserve the current model and report the failure.
  await page.locator('#model-file').setInputFiles({ name: 'invalid.vrm', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid VRM') });
  await expect(page.locator('#notice')).toContainText('Model loading failed');
  await expect(page.locator('#model-name')).toContainText('pixiv');
  await page.locator('#model-file').setInputFiles('public/avatar/sample.vrm');
  await expect(page.locator('#notice')).toContainText('VRM loaded');
  await expect(page.locator('#model-name')).toHaveText('sample.vrm');

  // Offline-after-navigation: model, WASM and inference must need only localhost.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5174)/, route => route.abort());
  await page.locator('#start').click();
  await expect(page.locator('#notice')).toContainText('Live tracking is on', { timeout: 90_000 });
  await expect(page.locator('#fps')).not.toHaveText('— FPS', { timeout: 30_000 });
  expect(assets.some(url => url.includes('/holistic/holistic.js'))).toBe(true);
  expect(assets.some(url => url.includes('/holistic/') && url.endsWith('.task'))).toBe(false);
  await expect(page.locator('#face-state')).toBeVisible();
  const stats = await page.evaluate(() => (window as unknown as { workerStats: { completed: number; maxInFlight: number } }).workerStats);
  expect(stats.completed).toBeGreaterThanOrEqual(2);
  expect(stats.maxInFlight).toBe(1);
  // Controls remain usable while the next inference runs in the worker.
  await page.locator('#mirror').uncheck();
  await expect(page.locator('#avatar-view')).not.toHaveClass(/mirrored/);
  await page.locator('#mirror').check();
  await page.screenshot({ path: 'artifacts/synthetic-camera.png', fullPage: true });
  await page.locator('#stop').click();
  expect(await page.evaluate(() => (window as unknown as { workerStats: { terminated: number } }).workerStats.terminated)).toBeGreaterThan(0);
  expect(await page.locator('#video').evaluate(v => (v as HTMLVideoElement).srcObject)).toBeNull();
  await expect(page.locator('#body-state')).toHaveText('—');
  await expect(page.locator('#start')).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('body').innerText()).not.toMatch(/\p{Script=Han}/u);
  expect(external).toEqual([]);
  // Malformed GLB import is handled inside load(); it should not throw globally.
  expect(errors).toEqual([]);
});

test('cancelling camera permission startup releases a late arriving stream', async ({ page }) => {
  await page.addInitScript(() => {
    const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await native(constraints);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      await new Promise(resolve => setTimeout(resolve, 700));
      return stream;
    };
  });
  await page.goto('/');
  await expect(page.locator('#notice')).toContainText('Ready.');
  await page.locator('#start').click();
  await expect(page.locator('#stop')).toBeEnabled();
  await page.locator('#stop').click();
  await expect(page.locator('#start')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => {
    const stream = (window as unknown as { testStream?: MediaStream }).testStream;
    return stream?.getTracks().every(track => track.readyState === 'ended') ?? false;
  })).toBe(true);
  await expect(page.locator('#mode')).toHaveText('Idle');
});

test('denied camera permission leaves the app usable and stops pending startup', async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await page.goto('/');
  await expect(page.locator('#notice')).toContainText('Ready.');
  await page.locator('#start').click();
  await expect(page.locator('#notice')).toContainText('Camera permission was denied.');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#stop')).toBeDisabled();
  await expect(page.locator('#demo')).toBeEnabled();
  await page.locator('#demo').click();
  await expect(page.locator('#mode')).toHaveText('Synthetic demo');
});

test('bundled sample attribution is preserved', async () => {
  const meta = JSON.parse(await readFile('public/avatar/sample-meta.json', 'utf8'));
  expect(meta.authors).toContain('pixiv Inc.');
  expect(meta.allowRedistribution).toBe(true);
});
