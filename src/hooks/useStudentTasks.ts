import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth.ts';
import { parseScorePercent } from '@/utils/score.ts';
import { ExamTaskMeta, getExamTaskMeta } from '@/utils/exam-task-meta.ts';
import { buildRuoEPracticePath } from '@/constants/ruoeRoutes.ts';

export type StudentTask = {
  id: string;
  type: 'writing' | 'ruoe';
  origin: 'teacher' | 'ai';
  status: 'not_started' | 'in_progress' | 'submitted' | 'evaluated' | 'completed';
  title: string;
  description: string;
  date: string; // ISO string
  score?: number; // RUoE percent score 0-100 when completed
  attemptNumber?: number | null;
  navTarget: { to: string; state?: { submissionId?: string; assignedPromptId?: string } };
  teacherName?: string | null;
  estimatedMinutes?: number;
  rawPromptText?: string | null;
  taskTypeId?: number | null;
  taskCode?: string | null;
  examTypeId?: number | null;
  examTypeCode?: string | null;
  examTypeName?: string | null;
  levelId?: number | null;
  levelCode?: string | null;
  levelName?: string | null;
  actualTimeSeconds?: number | null;
  meta: ExamTaskMeta;
};

export interface StudentTaskFilterOption<T = string> {
  value: T;
  label: string;
  description?: string;
  extra?: Record<string, unknown>;
}

export interface StudentTaskFilters {
  skills: StudentTaskFilterOption<'writing' | 'ruoe'>[];
  exams: StudentTaskFilterOption<string>[];
  sections: StudentTaskFilterOption<string>[];
  parts: StudentTaskFilterOption<string>[];
  formats: StudentTaskFilterOption<string>[];
}

export type UseStudentTasksOptions = {
  limit?: number;
  includeAllHomework?: boolean;
};

type TaskTypeRow = {
  id: number;
  name: string | null;
  task_code: string | null;
  default_time_minutes?: number | null;
  examType?: { id: number | null; code: string | null; name: string | null } | null;
  level?: { id: number | null; code: string | null; name: string | null } | null;
};

type TeacherPreferenceRecord = {
  full_name?: unknown;
} & Record<string, unknown>;

type TeacherInfoRow = {
  email: string | null;
  preferences?: unknown;
} | null;

type AssignedPromptQueryRow = {
  id: string;
  assigned_at: string;
  prompt_text: string | null;
  task_type_id: number;
  ruoe_exercise_id: number | null;
  taskType?: TaskTypeRow | null;
  teacher?: TeacherInfoRow;
};

type AssignedPromptRow = {
  id: string;
  assigned_at: string;
  prompt_text: string | null;
  task_type_id: number;
  ruoe_exercise_id: number | null;
  taskType?: TaskTypeRow | null;
  teacherName: string | null;
};

type SubmissionRow = {
  id: string;
  status: 'draft' | 'submitted' | 'evaluated' | string;
  updated_at: string;
  submitted_at: string | null;
  assigned_prompt_id: string | null;
  ai_generated_prompt_text: string | null;
  time_spent_seconds?: number | null;
  taskType?: TaskTypeRow | null;
  assigned_prompt?: {
    id: string;
    prompt_text: string | null;
    ruoe_exercise_id: number | null;
    teacherName: string | null;
  } | null;
  evaluation?: {
    ai_overall_score: string | null;
    teacher_overall_score: string | null;
  } | null;
};

type SubmissionQueryRow = {
  id: string;
  status: 'draft' | 'submitted' | 'evaluated' | string;
  updated_at: string;
  submitted_at: string | null;
  assigned_prompt_id: string | null;
  ai_generated_prompt_text: string | null;
  time_spent_seconds?: number | null;
  taskType?: TaskTypeRow | null;
  assigned_prompt: {
    id: string;
    prompt_text: string | null;
    ruoe_exercise_id: number | null;
    teacher?: TeacherInfoRow;
  } | null;
  evaluation?: {
    ai_overall_score: string | null;
    teacher_overall_score: string | null;
  } | null;
};

type RuoEAttemptRow = {
  id: number;
  status: 'in_progress' | 'completed' | string;
  started_at: string;
  completed_at: string | null;
  score: number | null;
  attempt_number: number | null;
  restarted_from_attempt_id: number | null;
  exercise?: { id: number; title: string | null; taskType?: TaskTypeRow | null } | null;
};

type FetchResult<T> = { rows: T[]; errorMessage: string | null };

function isTeacherPreferenceRecord(value: unknown): value is TeacherPreferenceRecord {
  return typeof value === 'object' && value !== null && 'full_name' in value;
}

function isStringObject(value: unknown): value is { valueOf(): string } {
  if (value instanceof String) return true;
  if (
    typeof value === 'object' &&
    value !== null &&
    'valueOf' in value &&
    typeof (value as { valueOf: unknown }).valueOf === 'function'
  ) {
    const primitive = (value as { valueOf: () => unknown }).valueOf();
    return typeof primitive === 'string';
  }
  return false;
}

function normalizeTeacherPreferenceName(preferences: unknown): string | null {
  if (!preferences) return null;
  if (typeof preferences === 'string') {
    return preferences.length ? preferences : null;
  }
  if (isStringObject(preferences)) {
    const primitive = preferences.valueOf();
    return primitive.length ? primitive : null;
  }
  if (isTeacherPreferenceRecord(preferences)) {
    return normalizeTeacherPreferenceName(preferences.full_name ?? null);
  }
  return null;
}

function resolveTeacherName(teacher?: TeacherInfoRow): string | null {
  if (!teacher) return null;
  return normalizeTeacherPreferenceName(teacher.preferences) ?? teacher.email ?? null;
}

function firstSentence(text: string | null | undefined, max = 60): string {
  if (!text) return '';
  const sentence = text.split('\n')[0].split('. ')[0];
  const trimmed = sentence.trim();
  return trimmed.length > max ? trimmed.slice(0, max) + '…' : trimmed;
}

export function useStudentTasks(options: UseStudentTasksOptions = {}) {
  const { user, memberships, activeAcademyId, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<StudentTask[]>([]);

  // Per-source loading/error state for Phase 1.5 Retry affordances
  const [assignedLoading, setAssignedLoading] = useState<boolean>(false);
  const [assignedError, setAssignedError] = useState<string | null>(null);
  const [submissionsLoading, setSubmissionsLoading] = useState<boolean>(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [ruoeLoading, setRuoELoading] = useState<boolean>(false);
  const [ruoeError, setRuoEError] = useState<string | null>(null);

  const limit = options.limit ?? 10;

  const studentMembershipId = useMemo(() => {
    if (!activeAcademyId) {
      return null;
    }
    const membership = memberships.find(
      (entry) => entry.academyId === activeAcademyId && entry.role === 'student',
    );
    return membership?.membershipId ?? null;
  }, [memberships, activeAcademyId]);
  const includeAllHomework = options.includeAllHomework ?? false;

  const isPendingHomework = (task: StudentTask) => (
    task.origin === 'teacher' && task.status !== 'evaluated' && task.status !== 'completed'
  );

  // Small helper to estimate minutes from task code if default is missing
  function estimateMinutesFromTaskCode(taskCode?: string | null): number | undefined {
    if (!taskCode) return undefined;
    const code = taskCode.toUpperCase();
    // Heuristics: UOE P1-3 ~11, P4 ~14, Reading P5-7 ~15
    if (code.includes('_UOE_P4')) return 14;
    if (code.includes('_UOE_P1') || code.includes('_UOE_P2') || code.includes('_UOE_P3')) return 11;
    if (code.includes('_READING_') || code.includes('_R_P')) return 15;
    return undefined;
  }

  // Fetchers per source
  const fetchAssigned = useCallback(async (membershipId: number): Promise<FetchResult<AssignedPromptRow>> => {
    setAssignedLoading(true); setAssignedError(null);
    try {
      const { data, error } = await supabase
        .from('assigned_prompts')
        .select(`
          id,
          assigned_at,
          prompt_text,
          task_type_id,
          ruoe_exercise_id,
          taskType: exam_task_types(id, name, task_code, default_time_minutes, examType: exam_types(id, code, name), level: levels(id, code, name)),
          teacher: profiles!assigned_prompts_teacher_id_fkey(
            email,
            preferences:user_preferences!inner(full_name)
          )
        `)
        .eq('student_membership_id', membershipId);
      if (error) throw error;
      const rows = (data ?? []) as AssignedPromptQueryRow[];
      const normalized: AssignedPromptRow[] = rows.map((row) => ({
        id: row.id,
        assigned_at: row.assigned_at,
        prompt_text: row.prompt_text,
        task_type_id: row.task_type_id,
        ruoe_exercise_id: row.ruoe_exercise_id,
        taskType: row.taskType,
        teacherName: resolveTeacherName(row.teacher),
      }));
      return { rows: normalized, errorMessage: null };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load assigned prompts';
      setAssignedError(message);
      return { rows: [] as AssignedPromptRow[], errorMessage: message };
    } finally {
      setAssignedLoading(false);
    }
  }, []);

  const fetchSubmissions = useCallback(async (membershipId: number): Promise<FetchResult<SubmissionRow>> => {
    setSubmissionsLoading(true); setSubmissionsError(null);
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          id,
          status,
          updated_at,
          submitted_at,
          assigned_prompt_id,
          ai_generated_prompt_text,
          time_spent_seconds,
          taskType: exam_task_types(id, name, task_code, default_time_minutes, examType: exam_types(id, code, name), level: levels(id, code, name)),
          assigned_prompt: assigned_prompts(
            id,
            prompt_text,
            ruoe_exercise_id,
            teacher: profiles!assigned_prompts_teacher_id_fkey(
              email,
              preferences:user_preferences!inner(full_name)
            )
          ),
          evaluation: evaluations(ai_overall_score, teacher_overall_score)
        `)
        .eq('student_membership_id', membershipId);
      if (error) throw error;
      const rows = (data ?? []) as SubmissionQueryRow[];
      const normalized: SubmissionRow[] = rows.map((row) => ({
        id: row.id,
        status: row.status,
        updated_at: row.updated_at,
        submitted_at: row.submitted_at,
        assigned_prompt_id: row.assigned_prompt_id,
        ai_generated_prompt_text: row.ai_generated_prompt_text,
        time_spent_seconds: row.time_spent_seconds,
        taskType: row.taskType,
        assigned_prompt: row.assigned_prompt
          ? {
              id: row.assigned_prompt.id,
              prompt_text: row.assigned_prompt.prompt_text,
              ruoe_exercise_id: row.assigned_prompt.ruoe_exercise_id,
              teacherName: resolveTeacherName(row.assigned_prompt.teacher),
            }
          : null,
        evaluation: row.evaluation,
      }));
      return { rows: normalized, errorMessage: null };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load writing submissions';
      setSubmissionsError(message);
      return { rows: [] as SubmissionRow[], errorMessage: message };
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);

  const fetchRuoE = useCallback(async (membershipId: number): Promise<FetchResult<RuoEAttemptRow>> => {
    setRuoELoading(true); setRuoEError(null);
    try {
      const { data, error } = await supabase
        .from('ruoe_user_attempts')
        .select(`
          id,
          status,
          started_at,
          completed_at,
          score,
          attempt_number,
          restarted_from_attempt_id,
          exercise: ruoe_exercises(id, title, taskType: exam_task_types(id, name, task_code, default_time_minutes, examType: exam_types(id, code, name), level: levels(id, code, name)))
        `)
        .eq('membership_id', membershipId);
      if (error) throw error;
      return { rows: (data || []) as RuoEAttemptRow[], errorMessage: null };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load R&UoE attempts';
      setRuoEError(message);
      return { rows: [] as RuoEAttemptRow[], errorMessage: message };
    } finally {
      setRuoELoading(false);
    }
  }, []);

  const rebuildTasks = useCallback((assigned: AssignedPromptRow[], submissions: SubmissionRow[], attempts: RuoEAttemptRow[]) => {
    // Build quick lookup sets
    const subsByAssigned = new Map<string, SubmissionRow[]>();
    for (const s of submissions) {
      if (s.assigned_prompt_id) {
        const arr = subsByAssigned.get(s.assigned_prompt_id) || [];
        arr.push(s);
        subsByAssigned.set(s.assigned_prompt_id, arr);
      }
    }

    const ruoeAttemptsByExercise = new Map<number, RuoEAttemptRow[]>();
    for (const a of attempts) {
      const exId = a.exercise?.id;
      if (typeof exId === 'number') {
        const arr = ruoeAttemptsByExercise.get(exId) || [];
        arr.push(a);
        ruoeAttemptsByExercise.set(exId, arr);
      }
    }

    const items: StudentTask[] = [];

    // Use shared score parser from utils

    const enrichWithMeta = (taskType: TaskTypeRow | null | undefined) => {
      const meta = getExamTaskMeta(taskType?.task_code ?? undefined, taskType?.name ?? undefined);
      const base = {
        taskTypeId: taskType?.id ?? null,
        taskCode: taskType?.task_code ?? null,
        examTypeId: taskType?.examType?.id ?? null,
        examTypeCode: taskType?.examType?.code ?? null,
        examTypeName: taskType?.examType?.name ?? null,
        levelId: taskType?.level?.id ?? null,
        levelCode: taskType?.level?.code ?? null,
        levelName: taskType?.level?.name ?? null,
      } as const;
      return { meta, ...base };
    };

    // B) Writing submissions — include assigned-origin and AI-origin
    for (const s of submissions) {
      const isAssigned = !!s.assigned_prompt_id;
      const origin: 'teacher' | 'ai' = isAssigned ? 'teacher' : 'ai';
      const type = 'writing' as const;
      const taskType = s.taskType ?? null;
      const enrichment = enrichWithMeta(taskType);

      const status: StudentTask['status'] = s.status === 'draft'
        ? 'in_progress'
        : s.status === 'submitted'
          ? 'submitted'
          : s.status === 'evaluated'
            ? 'evaluated'
            : 'in_progress';

      const title = isAssigned
        ? (firstSentence(s.assigned_prompt?.prompt_text, 60) || s.taskType?.name || 'Assigned Writing Task')
        : (firstSentence(s.ai_generated_prompt_text, 60) || s.taskType?.name || 'Writing Task');

      const description = s.taskType?.name || 'Writing';
      const date = s.updated_at || s.submitted_at || new Date().toISOString();
      const estimatedMinutes = (status === 'evaluated')
        ? undefined
        : (s.taskType?.default_time_minutes ?? estimateMinutesFromTaskCode(s.taskType?.task_code) ?? 20);

      // Score for Writing (prefer teacher_overall_score if present, else AI)
      const teacherPct = parseScorePercent(s.evaluation?.teacher_overall_score || null);
      const aiPct = parseScorePercent(s.evaluation?.ai_overall_score || null);
      const scorePercent = status === 'evaluated' ? (teacherPct ?? aiPct) : undefined;

      items.push({
        id: s.id,
        type,
        origin,
        status,
        title,
        description,
        date,
        estimatedMinutes,
        score: typeof scorePercent === 'number' ? scorePercent : undefined,
        actualTimeSeconds: typeof s.time_spent_seconds === 'number' ? s.time_spent_seconds : null,
        rawPromptText: isAssigned ? (s.assigned_prompt?.prompt_text ?? null) : (s.ai_generated_prompt_text ?? null),
        navTarget: status === 'evaluated'
          ? { to: `/evaluation/${s.id}` }
          : { to: '/editor', state: { submissionId: s.id } },
        teacherName: s.assigned_prompt?.teacherName ?? null,
        ...enrichment,
      });
    }

    // A) Assigned prompts — include 'not_started' only (no submission for that prompt)
    for (const ap of assigned) {
      const isRuoE = ap.ruoe_exercise_id !== null;
      const taskType = ap.taskType ?? null;
      const enrichment = enrichWithMeta(taskType);
      if (!isRuoE) {
        const submissionsForAp = subsByAssigned.get(ap.id) || [];
        if (submissionsForAp.length === 0) {
          items.push({
            id: ap.id,
            type: 'writing',
            origin: 'teacher',
            status: 'not_started',
            title: firstSentence(ap.prompt_text, 60) || ap.taskType?.name || 'Assigned Writing Task',
            description: ap.taskType?.name || 'Writing',
            date: ap.assigned_at,
            estimatedMinutes: ap.taskType?.default_time_minutes ?? estimateMinutesFromTaskCode(ap.taskType?.task_code) ?? 20,
            rawPromptText: ap.prompt_text ?? null,
            navTarget: { to: '/editor', state: { assignedPromptId: ap.id } },
            teacherName: ap.teacherName ?? null,
            ...enrichment,
          });
        }
      } else if (ap.ruoe_exercise_id) {
        const attemptsForExercise = ruoeAttemptsByExercise.get(ap.ruoe_exercise_id) || [];
        if (attemptsForExercise.length === 0) {
          items.push({
            id: String(ap.ruoe_exercise_id),
            type: 'ruoe',
            origin: 'teacher',
            status: 'not_started',
            title: 'R&UoE Exercise',
            description: ap.taskType?.name || 'R&UoE',
            date: ap.assigned_at,
            estimatedMinutes: ap.taskType?.default_time_minutes ?? estimateMinutesFromTaskCode(ap.taskType?.task_code) ?? 12,
            navTarget: { to: buildRuoEPracticePath(ap.ruoe_exercise_id) },
            teacherName: ap.teacherName ?? null,
            ...enrichment,
          });
        }
      }
    }

    // C) RUoE attempts — include in_progress and completed
    for (const a of attempts) {
      const status: StudentTask['status'] = a.status === 'completed' ? 'completed' : 'in_progress';
      const taskType = a.exercise?.taskType ?? null;
      const enrichment = enrichWithMeta(taskType);
      items.push({
        id: String(a.id),
        type: 'ruoe',
        origin: 'ai',
        status,
        attemptNumber: typeof a.attempt_number === 'number' ? a.attempt_number : null,
        title: a.exercise?.title || 'R&UoE Exercise',
        description: a.exercise?.taskType?.name || 'R&UoE',
        date: a.completed_at || a.started_at,
        score: a.status === 'completed' ? (typeof a.score === 'number' ? a.score : undefined) : undefined,
        estimatedMinutes: status === 'completed' ? undefined : (a.exercise?.taskType?.default_time_minutes ?? estimateMinutesFromTaskCode(a.exercise?.taskType?.task_code) ?? 12),
        navTarget: (() => {
          const exercisePath = buildRuoEPracticePath(a.exercise?.id);
          if (status === 'completed') {
            return { to: `${exercisePath}?attempt=${a.id}&view=results` };
          }
          return { to: `${exercisePath}?attempt=${a.id}&view=practice` };
        })(),
        ...enrichment,
      });
    }

    // Heuristic: mark RUoE attempts as 'teacher' origin if there's any assigned prompt for that exercise
    const assignedRuoEExerciseIds = new Set<number>(
      assigned.filter(ap => ap.ruoe_exercise_id != null).map(ap => ap.ruoe_exercise_id!)
    );
    for (const it of items) {
      if (it.type === 'ruoe' && it.origin === 'ai') {
        let exId: number | null = null;
        try {
          const url = new URL(it.navTarget.to, 'https://app.local');
          const segments = url.pathname.split('/').filter(Boolean);
          const lastSegment = segments.pop();
          if (lastSegment) {
            const parsed = Number.parseInt(lastSegment, 10);
            if (!Number.isNaN(parsed)) {
              exId = parsed;
            }
          }
        } catch {
          exId = null;
        }
        if (exId !== null && assignedRuoEExerciseIds.has(exId)) {
          it.origin = 'teacher';
        }
      }
    }

    // Sort by date desc and limit
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (includeAllHomework) {
      const homeworkItems = items.filter(isPendingHomework);
      const otherItems = items.filter((task) => !isPendingHomework(task));
      const limitedOthers = limit > 0 ? otherItems.slice(0, limit) : [];
      const merged = [...homeworkItems, ...limitedOthers];
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return merged;
    }

    return items.slice(0, limit);
  }, [includeAllHomework, limit]);

  // Keep last successful datasets to support per-source refetch
  const [lastAssigned, setLastAssigned] = useState<AssignedPromptRow[]>([]);
  const [lastSubmissions, setLastSubmissions] = useState<SubmissionRow[]>([]);
  const [lastAttempts, setLastAttempts] = useState<RuoEAttemptRow[]>([]);

  const runAll = useCallback(async () => {
    if (!user?.id || !studentMembershipId) {
      setTasks([]);
      setLastAssigned([]);
      setLastSubmissions([]);
      setLastAttempts([]);
      if (!authLoading) {
        setError('Select an academy to view your tasks.');
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [assignedResult, submissionsResult, attemptsResult] = await Promise.all([
        fetchAssigned(studentMembershipId),
        fetchSubmissions(studentMembershipId),
        fetchRuoE(studentMembershipId),
      ]);
      setLastAssigned(assignedResult.rows);
      setLastSubmissions(submissionsResult.rows);
      setLastAttempts(attemptsResult.rows);
      const rebuilt = rebuildTasks(assignedResult.rows, submissionsResult.rows, attemptsResult.rows);
      setTasks(rebuilt);
      const mergedError = [assignedResult.errorMessage, submissionsResult.errorMessage, attemptsResult.errorMessage]
        .filter(Boolean)
        .join(' | ') || null;
      setError(mergedError);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load tasks';
      setError(message);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user?.id, studentMembershipId, fetchAssigned, fetchSubmissions, fetchRuoE, rebuildTasks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await runAll();
    })();
    return () => { cancelled = true; };
  }, [runAll]);

  const refetchAll = useCallback(() => runAll(), [runAll]);
  const refetchAssigned = useCallback(async () => {
    if (!user?.id || !studentMembershipId) return;
    const { rows } = await fetchAssigned(studentMembershipId);
    setLastAssigned(rows);
    const rebuilt = rebuildTasks(rows, lastSubmissions, lastAttempts);
    setTasks(rebuilt);
  }, [user?.id, studentMembershipId, fetchAssigned, rebuildTasks, lastSubmissions, lastAttempts]);
  const refetchSubmissions = useCallback(async () => {
    if (!user?.id || !studentMembershipId) return;
    const { rows } = await fetchSubmissions(studentMembershipId);
    setLastSubmissions(rows);
    const rebuilt = rebuildTasks(lastAssigned, rows, lastAttempts);
    setTasks(rebuilt);
  }, [user?.id, studentMembershipId, fetchSubmissions, rebuildTasks, lastAssigned, lastAttempts]);
  const refetchRuoE = useCallback(async () => {
    if (!user?.id || !studentMembershipId) return;
    const { rows } = await fetchRuoE(studentMembershipId);
    setLastAttempts(rows);
    const rebuilt = rebuildTasks(lastAssigned, lastSubmissions, rows);
    setTasks(rebuilt);
  }, [user?.id, studentMembershipId, fetchRuoE, rebuildTasks, lastAssigned, lastSubmissions]);

  const filters = useMemo<StudentTaskFilters>(() => {
    const skillMap = new Map<string, StudentTaskFilterOption<'writing' | 'ruoe'>>();
    const examMap = new Map<string, StudentTaskFilterOption<string>>();
    const sectionMap = new Map<string, StudentTaskFilterOption<string>>();
    const partMap = new Map<string, StudentTaskFilterOption<string>>();
    const formatMap = new Map<string, StudentTaskFilterOption<string>>();

    for (const task of tasks) {
      const { meta } = task;

      // Skills
      if (!skillMap.has(meta.skill)) {
        skillMap.set(meta.skill, {
          value: meta.skill,
          label: meta.skillLabel,
        });
      }

      // Sections (e.g., Use of English, Reading, Writing)
      const sectionKey = `${meta.skill}::${meta.sectionLabel}`;
      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, {
          value: sectionKey,
          label: meta.sectionLabel,
          extra: { skill: meta.skill },
        });
      }

      // Exams combined with level for disambiguation
      const examKey = `${task.examTypeId ?? 'unknown'}::${task.levelId ?? 'any'}`;
      if (!examMap.has(examKey)) {
        const labelParts: string[] = [];
        if (task.examTypeName) labelParts.push(task.examTypeName);
        if (task.levelCode) labelParts.push(task.levelCode);
        const label = labelParts.join(' • ') || 'Unspecified exam';
        examMap.set(examKey, {
          value: examKey,
          label,
          extra: {
            examTypeId: task.examTypeId,
            levelId: task.levelId,
            examTypeCode: task.examTypeCode,
          },
        });
      }

      // Parts (e.g., Part 1, Task 2)
      const partKey = meta.partKey ? `${meta.skill}::${meta.sectionLabel}::${meta.partKey}` : null;
      if (partKey && !partMap.has(partKey)) {
        partMap.set(partKey, {
          value: partKey,
          label: meta.partLabel ?? meta.partKey,
          description: meta.sectionLabel,
          extra: {
            skill: meta.skill,
            section: meta.sectionLabel,
            partKey: meta.partKey,
            partNumber: meta.partNumber,
          },
        });
      }

      // Formats (Essay, Article, Multiple choice...)
      const formatKey = meta.formatLabel ? `${meta.skill}::${meta.partKey ?? 'na'}::${meta.formatLabel}` : null;
      if (formatKey && !formatMap.has(formatKey)) {
        formatMap.set(formatKey, {
          value: formatKey,
          label: meta.formatLabel,
          description: meta.partLabel ?? meta.sectionLabel,
          extra: {
            skill: meta.skill,
            partKey: meta.partKey,
          },
        });
      }
    }

    const sortByLabel = <T extends StudentTaskFilterOption<string | 'writing' | 'ruoe'>>(arr: T[]) =>
      arr.sort((a, b) => a.label.localeCompare(b.label));
    const sortByPart = (arr: StudentTaskFilterOption<string>[]) =>
      arr.sort((a, b) => {
        const aNum = typeof a.extra?.partNumber === 'number' ? a.extra.partNumber : Number.POSITIVE_INFINITY;
        const bNum = typeof b.extra?.partNumber === 'number' ? b.extra.partNumber : Number.POSITIVE_INFINITY;
        if (aNum !== bNum) return aNum - bNum;
        return a.label.localeCompare(b.label);
      });

    return {
      skills: sortByLabel(Array.from(skillMap.values())) as StudentTaskFilterOption<'writing' | 'ruoe'>[],
      exams: sortByLabel(Array.from(examMap.values())),
      sections: sortByLabel(Array.from(sectionMap.values())),
      parts: sortByPart(Array.from(partMap.values())),
      formats: sortByLabel(Array.from(formatMap.values())),
    };
  }, [tasks]);

  return {
    tasks,
    filters,
    loading: loading || assignedLoading || submissionsLoading || ruoeLoading,
    error,
    source: {
      assigned: { loading: assignedLoading, error: assignedError, refetch: refetchAssigned },
      submissions: { loading: submissionsLoading, error: submissionsError, refetch: refetchSubmissions },
      ruoe: { loading: ruoeLoading, error: ruoeError, refetch: refetchRuoE },
      refetchAll,
    },
  };
}
