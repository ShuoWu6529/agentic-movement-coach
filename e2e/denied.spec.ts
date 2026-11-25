// M1 browser check (PLANS.md §8): camera permission denied (AC 2).

import { expect, test } from '@playwright/test';

// The headless shell answers every prompt with NotSupportedError; full Chromium in headless mode
// denies the prompt the way a user would (NotAllowedError).
test.use({ channel: 'chromium', launchOptions: { args: ['--use-fake-device-for-media-stream', '--deny-permission-prompts'] } });

test.describe('with camera permission denied', () => {
  test('says access was denied and how to allow it, and offers no way to start (AC 2)', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Seated knee extension, right leg' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Camera access was denied');
    await expect(alert).toContainText(/allow/i);
    await expect(page.getByRole('button', { name: 'Start set' })).toHaveCount(0);
    await expect(page.getByRole('note', { name: 'Disclaimer' })).toBeVisible();
  });
});

