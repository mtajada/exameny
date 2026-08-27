import { test, expect } from '@playwright/test';

import { SupabaseE2ESeeder } from './utils/supabaseAdmin.ts';
import { signInUser } from './utils/session.ts';

test('user without memberships remains on the waiting screen after retry', async ({ page }) => {
  const seeder = new SupabaseE2ESeeder();
  const email = seeder.randomEmail('no-academy');
  const { userId } = await seeder.createUser(email);
  await seeder.ensureProfile(userId, email);

  try {
    await signInUser(page, { email, seeder });

    const waitingCard = page.getByRole('heading', { name: "You don't have any active academies yet." });
    const nameHeading = page.getByRole('heading', { name: "What's your name?" });

    await expect(nameHeading.or(waitingCard)).toBeVisible({ timeout: 120_000 });

    if (await nameHeading.isVisible().catch(() => false)) {
      const fullNameInput = page.getByLabel('Full name');
      await expect(fullNameInput).toBeVisible({ timeout: 120_000 });
      await fullNameInput.fill('Waiting User');
      await page.getByRole('button', { name: 'Save and continue' }).click();
      await expect(waitingCard).toBeVisible({ timeout: 120_000 });
    }

    await expect(waitingCard).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Your academy has not granted access yet.')).toBeVisible();
    await expect(page.getByText('Inactive academies')).toHaveCount(0);

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(waitingCard).toBeVisible({ timeout: 120_000 });
  } finally {
    await seeder.cleanup();
  }
});
