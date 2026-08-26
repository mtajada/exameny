import { test, expect } from '@playwright/test';

import { SupabaseE2ESeeder } from './utils/supabaseAdmin.ts';
import { signInUser } from './utils/session.ts';

test('academy admin converts a teacher to student via Members tab', async ({ page }) => {
  const seeder = new SupabaseE2ESeeder();
  const adminEmail = seeder.randomEmail('admin-role');
  const teacherEmail = seeder.randomEmail('target-role');

  await seeder.createUser(adminEmail);
  const { userId: teacherUserId } = await seeder.createUser(teacherEmail);

  await seeder.ensureProfile(teacherUserId, teacherEmail);
  const academy = await seeder.createAcademy(`E2E Admin ${Date.now()}`);

  await seeder.createMembership({
    academyId: academy.academyId,
    email: adminEmail,
    role: 'academy_admin',
  });

  await seeder.createMembership({
    academyId: academy.academyId,
    email: teacherEmail,
    role: 'teacher',
    status: 'active',
    userId: teacherUserId,
  });

  try {
    await signInUser(page, { email: adminEmail, seeder });
    await page.waitForURL('**/profile-setup**', { timeout: 120_000 });

    await page.getByLabel('Full name').fill('Primary Admin');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page.waitForURL('**/dashboard**', { timeout: 120_000 });

    await page.goto('/academy/dashboard#members');
    await expect(page.getByRole('heading', { name: 'Member management' })).toBeVisible({ timeout: 60_000 });

    const memberRow = page.getByRole('row', { name: new RegExp(teacherEmail, 'i') });
    await expect(memberRow).toBeVisible({ timeout: 60_000 });

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/functions/v1/admin-membership-role') &&
        response.request().method() === 'POST',
      { timeout: 60_000 },
    );

    await memberRow.getByRole('button', { name: /Convert to Student/i }).click();

    const response = await responsePromise;
    const status = response.status();
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }
    if (status >= 300) {
      throw new Error(`admin-membership-role failed (status=${status}): ${JSON.stringify(body)}`);
    }

    await expect(page.getByText('Role updated')).toBeVisible({ timeout: 60_000 });

    await expect(
      page.getByRole('row', { name: new RegExp(teacherEmail, 'i') }).getByText('Student'),
    ).toBeVisible({ timeout: 60_000 });
  } finally {
    await seeder.cleanup();
  }
});
