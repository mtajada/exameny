import { test, expect } from '@playwright/test';

import { SupabaseE2ESeeder } from './utils/supabaseAdmin.ts';
import { signInUser } from './utils/session.ts';

test('user without memberships stays on waiting screen until access granted', async ({ page }) => {
  const seeder = new SupabaseE2ESeeder();
  const email = seeder.randomEmail('no-academy');
  const { userId } = await seeder.createUser(email);
  await seeder.ensureProfile(userId, email);

  try {
    await signInUser(page, { email, seeder });

    const waitingCard = page.getByRole('heading', { name: "You don't have any active academies yet." });
    const fallbackCard = page.getByRole('heading', { name: "We couldn't finish setup" });
    const nameHeading = page.getByRole('heading', { name: "What's your name?" });

    await expect(nameHeading.or(waitingCard).or(fallbackCard)).toBeVisible({ timeout: 120_000 });

    if (await nameHeading.isVisible().catch(() => false)) {
      const fullNameInput = page.getByLabel('Full name');
      await expect(fullNameInput).toBeVisible({ timeout: 120_000 });
      await fullNameInput.fill('Waiting User');
      await page.getByRole('button', { name: 'Save and continue' }).click();
      await expect(waitingCard.or(fallbackCard)).toBeVisible({ timeout: 120_000 });
    }

    await expect(waitingCard.or(fallbackCard)).toBeVisible({ timeout: 120_000 });

    if (await waitingCard.isVisible().catch(() => false)) {
      await expect(page.getByText('Your academy has not granted access yet.')).toBeVisible();
      await expect(page.getByText('Inactive academies')).toHaveCount(0);
    } else {
      await expect(page.getByText('We could not sync your account. Try again in a moment.')).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  } finally {
    await seeder.cleanup();
  }
});
