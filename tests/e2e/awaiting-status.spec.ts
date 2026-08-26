import { test, expect } from '@playwright/test';

import { SupabaseE2ESeeder } from './utils/supabaseAdmin.ts';
import { signInUser } from './utils/session.ts';

test('waiting screen unlocks after membership activation and retry', async ({ page }) => {
  const seeder = new SupabaseE2ESeeder();
  const email = seeder.randomEmail('awaiting-status');
  const { userId } = await seeder.createUser(email);
  await seeder.ensureProfile(userId, email);
  const academy = await seeder.createAcademy(`E2E Waiting ${Date.now()}`);
  const { membershipId } = await seeder.createMembership({
    academyId: academy.academyId,
    email,
    role: 'teacher',
    status: 'inactive',
    userId,
  });
  try {
    await signInUser(page, { email, seeder });

    const waitingCard = page.getByRole('heading', { name: "You don't have any active academies yet." });
    const fallbackCard = page.getByRole('heading', { name: "We couldn't finish setup" });
    const nameHeading = page.getByRole('heading', { name: "What's your name?" });

    await expect(nameHeading.or(waitingCard).or(fallbackCard)).toBeVisible({ timeout: 120_000 });

    if (await nameHeading.isVisible().catch(() => false)) {
      const fullNameInput = page.getByLabel('Full name');
      await expect(fullNameInput).toBeVisible({ timeout: 120_000 });
      await fullNameInput.fill('Waiting Teacher');
      await page.getByRole('button', { name: 'Save and continue' }).click();
      await expect(waitingCard.or(fallbackCard)).toBeVisible({ timeout: 120_000 });
    }

    await expect(waitingCard.or(fallbackCard)).toBeVisible({ timeout: 120_000 });

    if (await waitingCard.isVisible().catch(() => false)) {
      await expect(page.getByText('Your access is temporarily paused.')).toBeVisible();
      await expect(page.getByText(academy.name)).toBeVisible();
    } else {
      await expect(
        page.getByText('We could not sync your account. Try again in a moment.'),
      ).toBeVisible({ timeout: 30_000 });
    }

    await seeder.setMembershipStatus(membershipId, 'active');
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.waitForURL('**/dashboard**', { timeout: 120_000 });
  } finally {
    await seeder.cleanup();
  }
});
