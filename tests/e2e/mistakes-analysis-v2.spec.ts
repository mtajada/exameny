import { test, expect } from '@playwright/test';

import { SupabaseE2ESeeder } from './utils/supabaseAdmin.ts';
import { signInUser } from './utils/session.ts';

const withDeadline = async <T>(label: string, operation: Promise<T>, timeoutMs = 30_000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs} ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

test.describe('Mistakes analysis v2', () => {
  test('renders with partial anchors and refreshes after regenerate', async ({ browser }) => {
    test.setTimeout(300_000);
    const seeder = new SupabaseE2ESeeder();
    const studentEmail = seeder.randomEmail('mistakes-v2-student');
    const adminEmail = seeder.randomEmail('mistakes-v2-admin');
    const { userId } = await seeder.createUser(studentEmail);
    await seeder.createUser(adminEmail);
    const examBundle = await seeder.createExamBundle('mistakes-v2');
    const academy = await seeder.createAcademy(`E2E Academy ${Date.now()}`);
    const { membershipId } = await seeder.createMembership({
      academyId: academy.academyId,
      email: studentEmail,
      role: 'student',
    });
    await seeder.createMembership({
      academyId: academy.academyId,
      email: adminEmail,
      role: 'academy_admin',
    });

    try {
      const studentContext = await browser.newContext();
      const studentPage = await studentContext.newPage();

      await signInUser(studentPage, { email: studentEmail, seeder });
      await studentPage.waitForURL('**/profile-setup**', { timeout: 120_000 });

      await studentPage.getByLabel('Full name').fill('E2E Student');
      await studentPage.getByRole('button', { name: 'Save and continue' }).click();

      await expect(studentPage.getByRole('heading', { name: 'Choose your goal' })).toBeVisible({
        timeout: 60_000,
      });

      await studentPage.getByLabel('Exam').click();
      await studentPage.getByRole('option', { name: examBundle.examName, exact: true }).click();

      await studentPage.getByLabel('Level').click();
      await studentPage
        .getByRole('option', { name: `${examBundle.levelName} (${examBundle.levelCode})`, exact: false })
        .click();

      await studentPage.getByRole('button', { name: 'Save and continue' }).click();
      await studentPage.waitForURL('**/dashboard**', { timeout: 120_000 });

      const submissionText =
        'I like apples because they are crisp and sweet, and I often eat them for breakfast. I like apples when I study. Sometimes I like bananas because they are easy to carry and taste good after training.';
      const bananasStart = submissionText.indexOf('bananas');
      if (bananasStart < 0) {
        throw new Error('E2E spec setup failed: could not find anchored span in submission text.');
      }

      const { submissionId } = await test.step('seed the evaluated submission', async () => {
        const submission = await withDeadline('createSubmission', seeder.createSubmission({
          studentId: userId,
          membershipId,
          taskTypeId: examBundle.taskTypeId,
          submissionText,
          promptText: 'Write a short paragraph about your preferences.',
        }));
        await withDeadline('ensureEvaluation', seeder.ensureEvaluation(submission.submissionId));
        return submission;
      });

      const initialItemsV2 = [
        {
          id: 'v2-1',
          category: 'GR',
          featureTags: ['ARTICLE'],
          anchorPatch: {
            before: 'bananas',
            after: null,
            contextBefore: 'like ',
            contextAfter: '.',
          },
          anchorResolution: {
            status: 'anchored',
            start: bananasStart,
            end: bananasStart + 'bananas'.length,
            strategy: 'before_unique',
            confidence: 0.9,
          },
          explanation: 'Use a consistent tense when describing your preferences.',
          suggestedCorrection: null,
          suggestedTag: null,
          meta: {},
        },
        {
          id: 'v2-2',
          category: 'GR',
          featureTags: ['WORD_ORDER'],
          anchorPatch: {
            before: 'I like apples',
            after: null,
            contextBefore: '',
            contextAfter: '',
          },
          anchorResolution: {
            status: 'ambiguous',
            strategy: 'before_multiple',
            candidates: 2,
          },
          explanation: 'Avoid repeating the same sentence structure too often.',
          suggestedCorrection: null,
          suggestedTag: null,
          meta: {},
        },
        {
          id: 'v2-3',
          category: 'GR',
          featureTags: ['WORD_ORDER'],
          anchorPatch: {
            before: 'oranges',
            after: null,
            contextBefore: '',
            contextAfter: '',
          },
          anchorResolution: {
            status: 'not_found',
            strategy: 'before',
          },
          explanation: 'Choose a more precise word to make the meaning clearer.',
          suggestedCorrection: null,
          suggestedTag: null,
          meta: {},
        },
      ];

      await test.step('seed the initial mistakes analysis', async () => {
        await withDeadline('setEvaluationMistakesV2', seeder.setEvaluationMistakesV2({
          submissionId,
          status: 'completed',
          itemsV2: initialItemsV2,
          metricsV2: {
            total: 3,
            anchored: 1,
            ambiguous: 1,
            not_found: 1,
            invalid: 0,
            resolverDurationMs: 12,
            resolverVersion: 2,
          },
          summary: {
            total: 3,
            byCategory: { GR: 3 },
            byTag: { ARTICLE: 1, WORD_ORDER: 2 },
          },
        }));
      });

      await studentPage.goto(`/evaluation/${submissionId}`);

      await expect(studentPage).toHaveURL(new RegExp(`/evaluation/${submissionId}$`), {
        timeout: 120_000,
      });

      await expect(studentPage.getByRole('heading', { name: 'Mistakes Analysis' })).toBeVisible({
        timeout: 120_000,
      });

      await expect(studentPage.getByText('No highlight: ambiguous match')).toBeVisible();
      await expect(studentPage.getByText('No highlight: not found')).toBeVisible();
      await expect(studentPage.getByText('Some items could not be highlighted')).toBeVisible();
      await expect(studentPage.getByLabel(/Mistake highlight:/)).toBeVisible();

      const highlightSection = studentPage.locator('section', { hasText: 'Submission highlight' });
      const highlightMarks = highlightSection.locator('mark');
      await expect(highlightMarks).toHaveCount(1);
      await expect(highlightMarks.first()).toContainText('bananas');
      await expect(highlightSection.locator('mark', { hasText: 'I like apples' })).toHaveCount(0);

      await expect(studentPage.getByRole('button', { name: 'Regenerate Mistakes' })).toHaveCount(0);
      await expect(studentPage.getByText('Contact your teacher or academy team')).toBeVisible();

      await studentContext.close();

      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();

      await signInUser(adminPage, { email: adminEmail, seeder });
      await adminPage.waitForURL('**/profile-setup**', { timeout: 120_000 });

      await adminPage.getByLabel('Full name').fill('E2E Admin');
      await adminPage.getByRole('button', { name: 'Save and continue' }).click();
      await adminPage.waitForURL('**/dashboard**', { timeout: 120_000 });

      await adminPage.goto(`/evaluation/${submissionId}?e2eModelName=e2e-fixture:mistakes-v2`);
      await expect(adminPage.getByRole('heading', { name: 'Mistakes Analysis' })).toBeVisible({
        timeout: 120_000,
      });
      await expect(adminPage.getByRole('button', { name: 'Regenerate Mistakes' })).toBeVisible();

      const responsePromise = adminPage.waitForResponse(
        (response) =>
          response.url().includes('/functions/v1/evaluate-submission') &&
          response.request().method() === 'POST',
        { timeout: 120_000 },
      );

      await adminPage.getByRole('button', { name: 'Regenerate Mistakes' }).click();

      const response = await responsePromise;
      if (response.status() >= 300) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = await response.text().catch(() => null);
        }
        throw new Error(`evaluate-submission failed (status=${response.status()}): ${JSON.stringify(body)}`);
      }

      await expect(adminPage.getByText('E2E fixture regenerated mistakes.')).toBeVisible({
        timeout: 120_000,
      });
      await expect(adminPage.getByText('No highlight: ambiguous match')).toHaveCount(0);
      await expect(adminPage.getByText('No highlight: not found')).toHaveCount(0);

      const adminHighlightSection = adminPage.locator('section', { hasText: 'Submission highlight' });
      const adminHighlightMarks = adminHighlightSection.locator('mark');
      await expect(adminHighlightMarks).toHaveCount(1);
      await expect(adminHighlightMarks.first()).toContainText('I like bananas');

      await adminPage.goto(`/evaluation/${submissionId}?e2eModelName=e2e-fixture:discarded-regression`);
      await expect(adminPage.getByRole('heading', { name: 'Mistakes Analysis' })).toBeVisible({
        timeout: 120_000,
      });
      await expect(adminPage.getByRole('button', { name: 'Regenerate Mistakes' })).toBeVisible();

      const regressionResponsePromise = adminPage.waitForResponse(
        (response) =>
          response.url().includes('/functions/v1/evaluate-submission') &&
          response.request().method() === 'POST',
        { timeout: 120_000 },
      );

      await adminPage.getByRole('button', { name: 'Regenerate Mistakes' }).click();

      const regressionResponse = await regressionResponsePromise;
      if (regressionResponse.status() >= 300) {
        let body: unknown = null;
        try {
          body = await regressionResponse.json();
        } catch {
          body = await regressionResponse.text().catch(() => null);
        }
        throw new Error(`evaluate-submission failed (status=${regressionResponse.status()}): ${JSON.stringify(body)}`);
      }

      await expect(adminPage.getByText(/5 mistakes detected/i)).toBeVisible({
        timeout: 120_000,
      });
      await expect(adminPage.getByText('E2E discarded regression item 1.')).toBeVisible({
        timeout: 120_000,
      });
      await expect(adminPage.getByText('Some items could not be shown')).toHaveCount(0);

      const regressionHighlightSection = adminPage.locator('section', { hasText: 'Submission highlight' });
      const regressionHighlightMarks = regressionHighlightSection.locator('mark');
      await expect(regressionHighlightMarks).toHaveCount(5);

      const evaluationSnapshot = await seeder.getEvaluationSnapshot(submissionId);
      expect(Array.isArray(evaluationSnapshot?.ai_mistakes_items_v2)).toBeTruthy();
      if (Array.isArray(evaluationSnapshot?.ai_mistakes_items_v2)) {
        expect(evaluationSnapshot.ai_mistakes_items_v2).toHaveLength(5);
      }

      await adminContext.close();
    } finally {
      await seeder.cleanup();
    }
  });
});
