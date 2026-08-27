import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

import type { Database, Json } from '../../../src/integrations/supabase/types.ts';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const EXAMENY_SUPABASE_SECRET_KEY = process.env.EXAMENY_SUPABASE_SECRET_KEY;
const E2E_REDIRECT_HOST = process.env.E2E_REDIRECT_HOST ?? 'http://localhost:8080';

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
}

if (!SUPABASE_URL || !EXAMENY_SUPABASE_SECRET_KEY) {
  throw new Error(
    'E2E tests require SUPABASE_URL (or VITE_SUPABASE_URL) and EXAMENY_SUPABASE_SECRET_KEY. Run npm run env:dev before Playwright.',
  );
}

if (!isLocalSupabaseUrl(SUPABASE_URL)) {
  throw new Error(
    'Refusing to seed a hosted Supabase project. Playwright E2E seeding is restricted to localhost.',
  );
}

const serviceClient = createClient<Database>(SUPABASE_URL, EXAMENY_SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type CleanupTask = () => Promise<void>;

export type MembershipRole = 'student' | 'teacher' | 'academy_admin';
export type MembershipStatus = 'awaiting_login' | 'active' | 'inactive';

const toDateString = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return value.toISOString().slice(0, 10);
};

const toCodeLabel = (label: string) => {
  const normalized = label.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 10);
  return normalized || 'CASE';
};

const createCode = (prefix: string, label: string, maxLength: number) => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const labelBudget = maxLength - prefix.length - suffix.length - 2;
  const codeLabel = toCodeLabel(label).slice(0, labelBudget);
  const code = `${prefix}_${codeLabel}_${suffix}`;

  if (!new RegExp(`^[A-Z][A-Z0-9_]{1,${maxLength - 1}}$`).test(code)) {
    throw new Error(`Unable to create a valid E2E code with prefix ${prefix}.`);
  }

  return code;
};

export interface ExamBundle {
  examId: number;
  examName: string;
  levelId: number;
  levelName: string;
  levelCode: string;
  taskTypeId: number;
}

export interface EvaluationSnapshot {
  ai_mistakes_status: string | null;
  ai_mistakes_error: string | null;
  ai_mistakes_items_v2: Json | null;
  ai_mistakes_metrics_v2: Json | null;
}

export interface MistakeRowSnapshot {
  id: string;
  anchor_start: number;
  anchor_end: number;
  category_id: number;
  tag_id: number | null;
}

export class SupabaseE2ESeeder {
  private cleanupTasks: CleanupTask[] = [];

  randomEmail(label: string) {
    return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@e2e.exameny`;
  }

  async createUser(email: string) {
    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) {
      throw error;
    }
    const userId = data.user?.id;
    if (!userId) {
      throw new Error('Supabase did not return a user id for created user.');
    }
    this.defer(async () => {
      await serviceClient.auth.admin.deleteUser(userId);
    });
    return { userId, email };
  }

  async generateMagicLink(email: string, redirectPath = '/auth') {
    const redirectTo = new URL(redirectPath, E2E_REDIRECT_HOST).toString();
    const { data, error } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    if (error) {
      throw error;
    }
    const actionLink = data.properties?.action_link;
    const emailOtp = data.properties?.email_otp ?? null;
    if (!actionLink) {
      throw new Error('Supabase did not return an action link.');
    }
    if (!emailOtp) {
      throw new Error('Supabase did not return an email OTP.');
    }
    return { actionLink, emailOtp };
  }

  async createAcademy(name: string) {
    const { data, error } = await serviceClient
      .from('academies')
      .insert({ name })
      .select('id, name')
      .single();
    if (error) {
      throw error;
    }
    this.defer(async () => {
      await serviceClient.from('academies').delete().eq('id', data.id);
    });
    return { academyId: data.id, name: data.name };
  }

  async createMembership(params: {
    academyId: number;
    email: string;
    role: MembershipRole;
    status?: MembershipStatus;
    userId?: string | null;
    subscriptionStartDate?: Date | string | null;
    subscriptionEndDate?: Date | string | null;
  }) {
    const desiredStatus = params.status ?? 'awaiting_login';
    const payloadBase = {
      academy_id: params.academyId,
      email: params.email.toLowerCase(),
      role: params.role,
      user_id: params.userId ?? null,
      subscription_start_date: toDateString(params.subscriptionStartDate),
      subscription_end_date: toDateString(params.subscriptionEndDate),
    };

    function insertMembership(status: string) {
      return serviceClient
        .from('academy_memberships')
        .insert({ ...payloadBase, status })
        .select('id')
        .single();
    }

    const dataResult = await insertMembership(desiredStatus);

    if (dataResult.error) {
      throw dataResult.error;
    }
    const data = dataResult.data;
    this.defer(async () => {
      await serviceClient.from('academy_memberships').delete().eq('id', data.id);
    });
    return { membershipId: data.id };
  }

  async ensureProfile(
    userId: string,
    email: string,
    overrides?: Partial<Database['public']['Tables']['profiles']['Insert']>,
  ) {
    const payload: Database['public']['Tables']['profiles']['Insert'] = {
      id: userId,
      email: email.toLowerCase(),
      full_name: null,
      role: overrides?.role ?? null,
      ...overrides,
    };
    const { error } = await serviceClient.from('profiles').upsert(payload);
    if (error) {
      throw error;
    }
  }

  async setMembershipStatus(membershipId: number, status: MembershipStatus) {
    const { error } = await serviceClient
      .from('academy_memberships')
      .update({ status })
      .eq('id', membershipId);
    if (error) {
      throw error;
    }
  }

  async createExamBundle(label: string): Promise<ExamBundle> {
    const levelCode = createCode('LV', label, 16);
    const levelName = `Level ${label.toUpperCase()}`;
    const baseId = Number((BigInt(Date.now()) % 1_000_000_000n) * 1000n + BigInt(Math.floor(Math.random() * 1000)));
    const levelId = 1_000_000_000 + baseId;
    const examId = 2_000_000_000 + baseId;
    const taskId = 3_000_000_000 + baseId;
    const { data: level, error: levelError } = await serviceClient
      .from('levels')
      .insert({ id: levelId, code: levelCode, name: levelName })
      .select('id, name, code')
      .single();
    if (levelError) {
      throw levelError;
    }
    this.defer(async () => {
      await serviceClient.from('levels').delete().eq('id', level.id);
    });

    const examCode = createCode('EX', label, 32);
    const examName = `Exam ${label.toUpperCase()} (${examCode})`;
    const { data: exam, error: examError } = await serviceClient
      .from('exam_types')
      .insert({ id: examId, code: examCode, name: examName, description: 'E2E coverage', max_score: 100 })
      .select('id, name')
      .single();
    if (examError) {
      throw examError;
    }
    this.defer(async () => {
      await serviceClient.from('exam_types').delete().eq('id', exam.id);
    });

    const taskCode = createCode('TASK', label, 64);
    const { error: taskError } = await serviceClient.from('exam_task_types').insert({
      id: taskId,
      exam_type_id: exam.id,
      level_id: level.id,
      task_code: taskCode,
      name: 'Writing',
      description: 'E2E placeholder task',
      default_time_minutes: 15,
    });
    if (taskError) {
      throw taskError;
    }
    this.defer(async () => {
      await serviceClient.from('exam_task_types').delete().eq('task_code', taskCode);
    });

    const criteriaPayload: Database['public']['Tables']['evaluation_criteria']['Insert'][] = [
      {
        name: `Content (${label})`,
        criterion_code: createCode('CR_CONTENT', label, 48),
        description: 'E2E criterion placeholder (content).',
      },
      {
        name: `Language (${label})`,
        criterion_code: createCode('CR_LANGUAGE', label, 48),
        description: 'E2E criterion placeholder (language).',
      },
    ];

    const { data: criteriaRows, error: criteriaError } = await serviceClient
      .from('evaluation_criteria')
      .insert(criteriaPayload)
      .select('id, criterion_code');

    if (criteriaError) {
      throw criteriaError;
    }

    const criterionIds = (criteriaRows ?? [])
      .map((row) => row.id)
      .filter((id): id is number => typeof id === 'number');

    if (criterionIds.length === 0) {
      throw new Error('E2E seeding failed: evaluation_criteria insert did not return ids.');
    }

    this.defer(async () => {
      await serviceClient.from('evaluation_criteria').delete().in('id', criterionIds);
    });

    const { error: linkError } = await serviceClient.from('task_criteria_link').insert(
      criterionIds.map((criterionId) => ({
        task_type_id: taskId,
        criterion_id: criterionId,
      })),
    );

    if (linkError) {
      throw linkError;
    }

    this.defer(async () => {
      await serviceClient.from('task_criteria_link').delete().eq('task_type_id', taskId);
    });

    return {
      examId: exam.id,
      examName: exam.name,
      levelId: level.id,
      levelName: level.name,
      levelCode,
      taskTypeId: taskId,
    };
  }

  async createSubmission(params: {
    studentId: string;
    membershipId: number;
    taskTypeId: number;
    submissionText: string;
    promptText: string;
    status?: Database['public']['Tables']['submissions']['Row']['status'];
  }) {
    const nowIso = new Date().toISOString();
    const trimmedText = params.submissionText.trim();
    const wordCount = trimmedText.length > 0 ? trimmedText.split(/\s+/).length : 0;
    const submissionStatus = params.status ?? 'evaluated';

    const { data, error } = await serviceClient
      .from('submissions')
      .insert({
        student_id: params.studentId,
        student_membership_id: params.membershipId,
        task_type_id: params.taskTypeId,
        submission_text: params.submissionText,
        ai_generated_prompt_text: params.promptText,
        status: submissionStatus,
        submitted_at: nowIso,
        evaluation_requested_at: nowIso,
        time_spent_seconds: 120,
        word_count: wordCount,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    this.defer(async () => {
      await serviceClient.from('submissions').delete().eq('id', data.id);
    });

    return { submissionId: data.id };
  }

  async ensureEvaluation(submissionId: string) {
    const { error } = await serviceClient
      .from('evaluations')
      .upsert({ submission_id: submissionId }, { onConflict: 'submission_id' });

    if (error) {
      throw error;
    }
  }

  async setEvaluationMistakesV2(params: {
    submissionId: string;
    status?: 'pending' | 'completed' | 'failed';
    errorMessage?: string | null;
    summary?: Json | null;
    itemsV2: Json[];
    metricsV2: Json;
  }) {
    const updatePayload = {
      ai_mistakes_status: params.status ?? 'completed',
      ai_mistakes_error: params.errorMessage ?? null,
      ai_mistakes_summary: params.summary ?? null,
      ai_mistakes_items_v2: params.itemsV2,
      ai_mistakes_metrics_v2: params.metricsV2,
    } satisfies Database['public']['Tables']['evaluations']['Update'];

    const { error } = await serviceClient
      .from('evaluations')
      .update(updatePayload)
      .eq('submission_id', params.submissionId);

    if (error) {
      if (error.code === 'PGRST204') {
        throw new Error(
          `PostgREST cannot see evaluations.ai_mistakes_items_v2 / ai_mistakes_metrics_v2 (PGRST204). Ensure the Mistakes v2 migration has been applied (Documentation/Migrations SQL/migrations_writing/022_mistakes_analysis_v2_columns_and_rpc.sql) and reload schema cache (Documentation/Migrations SQL/migrations_auth/023_reload_postgrest_schema.sql), then rerun Playwright.`,
        );
      }
      throw error;
    }
  }

  async getUserPreferences(userId: string) {
    const { data, error } = await serviceClient
      .from('user_preferences')
      .select('user_id, active_academy_id, full_name, target_exam_id, target_level_id')
      .eq('user_id', userId)
      .single();
    if (!error) {
      return data;
    }

    if (error.code === 'PGRST205') {
      throw new Error(
        `PostgREST is not exposing public.user_preferences (error PGRST205). Run Documentation/Migrations SQL/migrations_auth/023_reload_postgrest_schema.sql or execute NOTIFY pgrst, 'reload schema'; on the project before running Playwright.`,
      );
    }

    throw error;
  }

  async getEvaluationSnapshot(submissionId: string): Promise<EvaluationSnapshot | null> {
    const { data, error } = await serviceClient
      .from('evaluations')
      .select('ai_mistakes_status, ai_mistakes_error, ai_mistakes_items_v2, ai_mistakes_metrics_v2')
      .eq('submission_id', submissionId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST204') {
        throw new Error(
          `PostgREST cannot see evaluations.ai_mistakes_items_v2 / ai_mistakes_metrics_v2 (PGRST204). Ensure the Mistakes v2 migration has been applied (Documentation/Migrations SQL/migrations_writing/022_mistakes_analysis_v2_columns_and_rpc.sql) and reload schema cache (Documentation/Migrations SQL/migrations_auth/023_reload_postgrest_schema.sql), then rerun Playwright.`,
        );
      }
      throw error;
    }

    return data as EvaluationSnapshot | null;
  }

  async getMistakesForSubmission(submissionId: string): Promise<MistakeRowSnapshot[]> {
    const { data, error } = await serviceClient
      .from('mistakes')
      .select('id, anchor_start, anchor_end, category_id, tag_id')
      .eq('writing_submission_id', submissionId)
      .order('anchor_start', { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []) as MistakeRowSnapshot[];
  }

  async cleanup() {
    while (this.cleanupTasks.length > 0) {
      const task = this.cleanupTasks.pop();
      if (!task) {
        continue;
      }
      try {
        await task();
      } catch (error) {
        console.warn('[E2E cleanup] task failed', error);
      }
    }
  }

  private defer(task: CleanupTask) {
    this.cleanupTasks.push(task);
  }
}
