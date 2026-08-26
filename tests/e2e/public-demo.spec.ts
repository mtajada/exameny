import { expect, test } from '@playwright/test';

test.describe('public demo', () => {
  test('shows original activities and role workflows without a remote request', async ({ page }) => {
    const remoteRequests: string[] = [];

    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
        remoteRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
      }
    });

    await page.goto('/landing');
    await expect(page.getByRole('heading', { name: /Better exam preparation/ })).toBeVisible();
    await page.getByRole('link', { name: /Explore the public demo/ }).click();

    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole('heading', { name: 'Clean-room learning demo' })).toBeVisible();
    await expect(page.getByText('Eight activity types')).toBeVisible();

    const activityButtons = page.locator('aside button');
    await expect(activityButtons).toHaveCount(8);
    await activityButtons.nth(1).click();
    await expect(page.locator('article h2')).not.toBeEmpty();

    await page.getByRole('link', { name: 'Try speaking practice' }).click();
    await expect(page).toHaveURL(/\/demo\/speaking$/);
    await expect(page.getByText('Local synthetic demo')).toBeVisible();
    await page.getByRole('button', { name: 'Start speaking rehearsal' }).click();

    for (const answer of [
      'We could organise a neighbourhood book exchange.',
      'A repair workshop is another useful option for local residents.',
      'I prefer the workshop, and the next step is to invite volunteers.',
    ]) {
      await page.getByLabel(/Speak aloud, then type/i).fill(answer);
      await page.getByRole('button', { name: 'Add answer' }).click();
    }
    await page.getByRole('button', { name: 'Finish and save transcript' }).click();
    await expect(page.getByText('Local demo completed')).toBeVisible();
    await page.screenshot({ path: 'test-results/public-demo-speaking.png', fullPage: true });
    await page.getByRole('button', { name: 'Choose another rehearsal' }).click();
    await page.getByRole('link', { name: 'Back to the activity demo' }).click();

    await page.getByRole('link', { name: 'View role workflows' }).click();
    await expect(page).toHaveURL(/\/demo\/roles$/);
    await expect(page.getByRole('heading', { name: 'Role workflows' })).toBeVisible();

    await page.getByRole('tab', { name: /Teacher/ }).click();
    await expect(page.getByText('Prepare an assignment')).toBeVisible();
    await page.getByRole('tab', { name: /Academy/ }).click();
    await expect(page.getByText('Organise the learning community')).toBeVisible();

    expect(remoteRequests).toEqual([]);
  });
});
