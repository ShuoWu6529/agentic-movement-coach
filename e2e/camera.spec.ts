// Browser checks (PLANS.md §8): AC 1 and 5 with a fake camera, and AC 20 (log download validates) for
// knee extension (M1) and sit-to-stand (M2).

import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { extension, kneeTrace, SETTLE } from '../fixtures/synthetic/kneeTrace';
import { cycle, sitToStandTrace, STS_SETTLE } from '../fixtures/synthetic/sitToStandTrace';
import { logInvariantProblems } from '../src/core/log/invariants';
import { SessionLogSchema } from '../src/core/log/schema';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

test.describe('with a fake camera', () => {
  test('opens the camera, loads the model on-device and fails closed without a person (AC 1, 5, 19)', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(u.hostname) && !u.protocol.startsWith('blob') && !u.protocol.startsWith('data')) external.push(r.url());
    });
    await page.goto('./');
    await expect(page.getByRole('note', { name: 'Disclaimer' })).toContainText('not clinically validated');
    await page.getByRole('button', { name: 'Seated knee extension, left leg' }).click();

    // The model loads from this server, then the framing check runs on live frames.
    await expect(page.getByRole('heading', { name: 'Check your position' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('status').first()).toContainText(/can't see you|dim/i, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Start set' })).toBeDisabled();

    // The preview is live: a frame drawn from the video element is not blank.
    const spread = await page.evaluate(async () => {
      const v = document.querySelector('video')!;
      await new Promise((r) => setTimeout(r, 300));
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 48;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const y = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
      return max - min;
    });
    expect(spread).toBeGreaterThan(20);
    await expect(page.getByLabel('Skeleton overlay')).toBeVisible();
    expect(external).toEqual([]); // C-2: no third-party requests
  });
});

test('replays a pose trace and downloads a session log that validates (AC 20)', async ({ page }, info) => {
  const trace = kneeTrace({ side: 'left', segments: [...SETTLE, ...extension(5, 3500), ...extension(25, 1500), { ms: 600, noPose: true }, { ms: 1500, flexion: 90 }] });
  await page.goto('./');
  await page.getByText('Research: replay a recorded pose trace').click();
  await page.getByLabel('Pose trace file (.json)').setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(trace)),
  });
  await page.getByRole('button', { name: 'Replay trace' }).click();
  await expect(page.getByRole('heading', { name: 'Set summary' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel('Repetitions completed')).toContainText('1 /');

  await page.getByText('Research export').click();
  await page.getByLabel('Observer note').fill('playwright');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download session log' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^session-knee-extension-left-.*\.json$/);
  const path = info.outputPath('log.json');
  await download.saveAs(path);
  const log = JSON.parse(await readFile(path, 'utf8'));
  const parsed = SessionLogSchema.safeParse(log);
  expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
  expect(logInvariantProblems(parsed.data!)).toEqual([]);
  expect(log.observerNote).toBe('playwright');
  expect(log.app.gitSha).not.toBe('');
});

test('replays a sit-to-stand trace and downloads a session log that validates (AC 11, 20)', async ({ page }, info) => {
  const trace = sitToStandTrace({ segments: [...STS_SETTLE, ...cycle(), ...cycle({ up: 1000 }), { ms: 600, noPose: true }, { ms: 1500, p: 0 }] });
  await page.goto('./');
  await page.getByText('Research: replay a recorded pose trace').click();
  await page.getByLabel('Pose trace file (.json)').setInputFiles({
    name: 'synthetic-sts.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(trace)),
  });
  await page.getByLabel('Exercise', { exact: true }).selectOption('sitToStand');
  await page.getByRole('button', { name: 'Replay trace' }).click();
  await expect(page.getByRole('heading', { name: 'Set summary' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel('Repetitions completed')).toContainText('2 /');
  await expect(page.getByLabel('Average rise time')).toContainText('target 1–3 s');

  await page.getByText('Research export').click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download session log' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^session-sit-to-stand-.*\.json$/);
  const path = info.outputPath('log.json');
  await download.saveAs(path);
  const log = JSON.parse(await readFile(path, 'utf8'));
  const parsed = SessionLogSchema.safeParse(log);
  expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
  expect(logInvariantProblems(parsed.data!)).toEqual([]);
  expect(log.exercise).toBe('sitToStand');
  expect(log.events.map((e: { ruleId?: string }) => e.ruleId).filter(Boolean)).toEqual(['STS-TEMPO-GOOD', 'STS-RISE-FAST']);
});
