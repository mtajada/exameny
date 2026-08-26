import { test, expect } from '@playwright/test';

import { SupabaseE2ESeeder } from './utils/supabaseAdmin.ts';
import { signInUser } from './utils/session.ts';

test.describe('Invite onboarding', () => {
  test('student invitation enforces name + exam + level before dashboard unlocks', async ({ page }) => {
    const seeder = new SupabaseE2ESeeder();
    const email = seeder.randomEmail('student-onboarding');
    await seeder.createUser(email);
    const examBundle = await seeder.createExamBundle('student');
    const academy = await seeder.createAcademy(`E2E Academy ${Date.now()}`);
    await seeder.createMembership({
      academyId: academy.academyId,
      email,
      role: 'student',
    });
    try {
      await signInUser(page, { email, seeder });
      await page.waitForURL('**/profile-setup**', { timeout: 120_000 });

      await page.getByLabel('Full name').fill('E2E Student');
      await page.getByRole('button', { name: 'Save and continue' }).click();

      await expect(page.getByRole('heading', { name: 'Choose your goal' })).toBeVisible({
        timeout: 60_000,
      });

      await page.getByLabel('Exam').click();
      await page.getByRole('option', { name: examBundle.examName, exact: true }).click();

      await page.getByLabel('Level').click();
      await page
        .getByRole('option', { name: `${examBundle.levelName} (${examBundle.levelCode})`, exact: false })
        .click();

      await page.getByRole('button', { name: 'Save and continue' }).click();
      await page.waitForURL('**/dashboard**', { timeout: 120_000 });

      await page.goto('/profile-setup');
      await page.waitForURL('**/dashboard**', { timeout: 60_000 });
    } finally {
      await seeder.cleanup();
    }
  });
});
