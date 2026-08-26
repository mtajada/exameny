import { test, expect } from '@playwright/test';

import { SupabaseE2ESeeder } from './utils/supabaseAdmin.ts';
import { signInUser } from './utils/session.ts';

test('multi-academy selector updates preferences via user-set-active-academy', async ({ page }) => {
  const seeder = new SupabaseE2ESeeder();
  const email = seeder.randomEmail('multi-academy');
  const { userId } = await seeder.createUser(email);
  const academyAlpha = await seeder.createAcademy(`E2E Alpha ${Date.now()}`);
  const academyBeta = await seeder.createAcademy(`E2E Beta ${Date.now() + 1}`);

  await seeder.createMembership({ academyId: academyAlpha.academyId, email, role: 'teacher' });
  await seeder.createMembership({ academyId: academyBeta.academyId, email, role: 'teacher' });

  try {
    await signInUser(page, { email, seeder });
    const fullNameInput = page.getByLabel('Full name');
    const academySelectorHeading = page.getByRole('heading', { name: 'Choose your academy' });

    await expect(fullNameInput.or(academySelectorHeading)).toBeVisible({ timeout: 120_000 });

    if (await fullNameInput.isVisible().catch(() => false)) {
      await fullNameInput.fill('E2E Multi Teacher');
      await page.getByRole('button', { name: 'Save and continue' }).click();
      await expect(fullNameInput).toBeHidden({ timeout: 120_000 });
    }

    await expect(academySelectorHeading).toBeVisible({ timeout: 120_000 });

    const academyBetaButton = page.getByRole('button', { name: academyBeta.name, exact: false });
    await expect(academyBetaButton).toBeVisible({ timeout: 120_000 });
    await academyBetaButton.click();
    await page.waitForURL('**/dashboard**', { timeout: 120_000 });

    const preferences = await seeder.getUserPreferences(userId);
    expect(preferences.active_academy_id).toBe(academyBeta.academyId);

    await page.goto('/auth');
    await page.waitForURL('**/dashboard**', { timeout: 60_000 });
  } finally {
    await seeder.cleanup();
  }
});
