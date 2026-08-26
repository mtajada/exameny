import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import type { Tables } from '@/integrations/supabase/types.ts'
import type { StudentProgressSnapshot } from '@/features/student-progress/types.ts'
import {
  type NormalizedDataBundle,
  type NormalizedRuoeAttempt,
  type NormalizedRuoeMistake,
  type NormalizedWritingEvaluation,
  deriveAvailableExamOptions,
  enrichSnapshot,
  filterBundleByExamId,
  resolveExamMetadata,
} from './utils.ts'

interface StudentProfileRow {
  membership_id: number | string
  user_id: string
  assigned_teacher_id: string | null
  target_exam_id: number | null
  targetExam: {
    id: number
    name: string | null
    max_score: number | null
  } | null
  membership?: {
    academy_id?: number | null
    status?: string | null
  } | null
}

type EvaluationRow = Pick<
  Tables<'evaluations'>,
  | 'id'
  | 'ai_overall_score'
  | 'ai_overall_commentary'
  | 'teacher_overall_score'
  | 'teacher_comments'
  | 'ai_criteria_evaluation'
  | 'evaluation_completed_at'
> & {
  submission: (Pick<
    Tables<'submissions'>,
    'id' | 'submitted_at' | 'updated_at' | 'task_type_id' | 'time_spent_seconds' | 'student_membership_id'
  > & {
    exam_task_types: (Pick<
      Tables<'exam_task_types'>,
      'id' | 'task_code' | 'name' | 'exam_type_id' | 'default_time_minutes'
    > & {
      exam_types: Pick<Tables<'exam_types'>, 'id' | 'name' | 'max_score'> | null
    }) | null
  }) | null
}

type RuoeAttemptRow = Pick<
  Tables<'ruoe_user_attempts'>,
  'id' | 'score' | 'max_score' | 'completed_at' | 'status' | 'attempt_number' | 'restarted_from_attempt_id'
> & {
  ruoe_exercises: (Pick<Tables<'ruoe_exercises'>, 'id' | 'task_type_id'> & {
    exam_task_types: (Pick<
      Tables<'exam_task_types'>,
      'id' | 'task_code' | 'name' | 'exam_type_id'
    > & {
      exam_types: Pick<Tables<'exam_types'>, 'id' | 'name' | 'max_score'> | null
    }) | null
  }) | null
}

type RuoeMistakeRow = {
  attempt_id: number
  question_id: number
  user_answer: string | null
  is_correct: boolean | null
  attempt?: {
    completed_at?: string | null
    attempt_number?: number | null
    restarted_from_attempt_id?: number | null
    ruoe_exercises?: {
      id?: number | null
      exam_task_types?: { exam_type_id?: number | null } | null
    } | null
  } | null
  question?: {
    id?: number | null
    order?: number | null
    question_text?: string | null
    explanation?: string | null
  } | null
}

export interface FetchStudentProgressParams {
  studentId: string
  examId?: number | string | null
  requestingTeacherId?: string | null
  academyId?: number | null
  client?: SupabaseClient
}

export async function fetchStudentProgress({
  studentId,
  examId,
  requestingTeacherId,
  academyId,
  client,
}: FetchStudentProgressParams): Promise<StudentProgressSnapshot> {
  if (!studentId) {
    throw new Error('studentId is required to fetch progress data.')
  }

  const db = client ?? supabase

  let profileQuery = db
    .from('student_profiles')
    .select(
      `
        membership_id,
        user_id,
        assigned_teacher_id,
        target_exam_id,
        targetExam:exam_types!student_profiles_target_exam_id_fkey(id, name, max_score),
        membership:academy_memberships!inner(academy_id, status)
      `,
    )
    .eq('user_id', studentId)
    .eq('membership.status', 'active')

  if (academyId != null) {
    profileQuery = profileQuery.eq('membership.academy_id', academyId)
  }

  const { data: studentProfile, error: profileError } = await profileQuery.maybeSingle<StudentProfileRow>()

  if (profileError) {
    throw profileError
  }

  if (!studentProfile) {
    throw new Error(
      academyId != null ? 'Student profile not found for the selected academy.' : 'Student profile not found.',
    )
  }

  const membershipIdRaw = studentProfile.membership_id
  const studentMembershipId =
    typeof membershipIdRaw === 'number'
      ? membershipIdRaw
      : Number.parseInt(String(membershipIdRaw), 10)

  if (!Number.isFinite(studentMembershipId)) {
    throw new Error('Student profile is missing a valid membership identifier.')
  }

  if (requestingTeacherId && studentProfile.assigned_teacher_id !== requestingTeacherId) {
    throw new Error('Teacher is not authorized to view this student.')
  }

  const normalizedExamId = normalizeExamId(examId)
  const fallbackExamMetadata = studentProfile.target_exam_id
    ? {
        examId: studentProfile.target_exam_id,
        examName: studentProfile.targetExam?.name ?? null,
        maxScore: studentProfile.targetExam?.max_score ?? null,
      }
    : null

  const [writingRes, ruoeAttemptRes, mistakesRes] = await Promise.all([
    db
      .from('evaluations')
      .select(
        `
          id,
          ai_overall_score,
          ai_overall_commentary,
          teacher_overall_score,
          teacher_comments,
          ai_criteria_evaluation,
          evaluation_completed_at,
          submission:submissions!inner(
            id,
            submitted_at,
            updated_at,
            student_membership_id,
            task_type_id,
            time_spent_seconds,
            exam_task_types!inner(
              id,
              task_code,
              name,
              exam_type_id,
              default_time_minutes,
              exam_types!inner(id, name, max_score)
            )
          )
        `,
      )
      .eq('submission.student_membership_id', studentMembershipId)
      .order('evaluation_completed_at', { ascending: true })
      .returns<EvaluationRow[]>(),
    db
      .from('ruoe_user_attempts')
      .select(
        `
          id,
          score,
          max_score,
          completed_at,
          status,
          attempt_number,
          restarted_from_attempt_id,
          ruoe_exercises!inner(
            id,
            task_type_id,
            exam_task_types!inner(
              id,
              task_code,
              name,
              exam_type_id,
              exam_types!inner(id, name, max_score)
            )
          )
        `,
      )
      .eq('membership_id', studentMembershipId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: true })
      .returns<RuoeAttemptRow[]>(),
    db
      .from('ruoe_user_answers')
      .select(
        `
          attempt_id,
          question_id,
          user_answer,
          is_correct,
          attempt:ruoe_user_attempts!inner(
            student_id,
            membership_id,
            completed_at,
            attempt_number,
            restarted_from_attempt_id,
            ruoe_exercises!inner(
              id,
              exam_task_types!inner(exam_type_id)
            )
          ),
          question:ruoe_questions(id, order, question_text, explanation)
        `,
      )
      .eq('attempt.membership_id', studentMembershipId)
      .eq('is_correct', false)
      .order('completed_at', { ascending: false, foreignTable: 'ruoe_user_attempts' })
      .limit(40)
      .returns<RuoeMistakeRow[]>(),
  ])

  if (writingRes.error) throw writingRes.error
  if (ruoeAttemptRes.error) throw ruoeAttemptRes.error
  if (mistakesRes.error) throw mistakesRes.error

  const writingRows = writingRes.data ?? []
  const ruoeRows = ruoeAttemptRes.data ?? []
  const mistakeRows = mistakesRes.data ?? []

  const bundleAll: NormalizedDataBundle = {
    writing: writingRows.map(mapWritingRow),
    ruoe: ruoeRows.map(mapRuoeAttemptRow),
    mistakes: mistakeRows.map(mapRuoeMistakeRow),
  }

  const availableExams = deriveAvailableExamOptions(bundleAll)

  let resolvedExamId = normalizedExamId
  if (resolvedExamId == null) {
    const fallbackId = fallbackExamMetadata?.examId ?? null
    if (fallbackId != null && availableExams.some((option) => option.examId === fallbackId)) {
      resolvedExamId = fallbackId
    } else if (availableExams.length > 0) {
      resolvedExamId = availableExams[0].examId
    }
  }

  const filteredBundle = filterBundleByExamId(bundleAll, resolvedExamId)
  const examMetadata = resolveExamMetadata(bundleAll, resolvedExamId ?? null, fallbackExamMetadata)
  const metadataFallback = resolvedExamId != null
    ? {
        examId: resolvedExamId,
        examName: fallbackExamMetadata?.examName ?? null,
        maxScore: fallbackExamMetadata?.maxScore ?? null,
      }
    : fallbackExamMetadata ?? {
        examId: 0,
        examName: null,
        maxScore: null,
      }

  const enriched = enrichSnapshot(filteredBundle, examMetadata, availableExams)

  return {
    aggregates: enriched.aggregates,
    performanceHistory: enriched.performanceHistory,
    taskPerformance: enriched.taskPerformance,
    writingCriteria: enriched.writingCriteria,
    ruoeMistakes: enriched.ruoeMistakes,
    insights: enriched.insights,
    metadata: examMetadata ?? metadataFallback,
    availableExams,
  }
}

function normalizeExamId(examId: number | string | null | undefined): number | null {
  if (examId == null) return null
  if (typeof examId === 'number') return Number.isFinite(examId) ? examId : null
  const parsed = Number.parseInt(examId, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function mapWritingRow(row: EvaluationRow): NormalizedWritingEvaluation {
  const examTask = row.submission?.exam_task_types
  return {
    evaluationId: row.id,
    examId: examTask?.exam_type_id ?? null,
    examName: examTask?.exam_types?.name ?? null,
    examMaxScore: examTask?.exam_types?.max_score ?? null,
    taskTypeId: examTask?.id ?? null,
    taskCode: examTask?.task_code ?? null,
    taskName: examTask?.name ?? 'Untitled task',
    submittedAt: row.submission?.submitted_at ?? null,
    updatedAt: row.submission?.updated_at ?? null,
    evaluationCompletedAt: row.evaluation_completed_at ?? null,
    aiOverallScore: row.ai_overall_score ?? null,
    aiOverallCommentary: row.ai_overall_commentary ?? null,
    teacherOverallScore: row.teacher_overall_score ?? null,
    teacherComments: row.teacher_comments ?? null,
    timeSpentSeconds: row.submission?.time_spent_seconds ?? null,
    defaultTimeMinutes: examTask?.default_time_minutes ?? null,
    aiCriteriaEvaluation: Array.isArray(row.ai_criteria_evaluation)
      ? (row.ai_criteria_evaluation as Array<{ criterionName: string; score: string; feedback?: string }>)
      : null,
  }
}

function mapRuoeAttemptRow(row: RuoeAttemptRow): NormalizedRuoeAttempt {
  const examTask = row.ruoe_exercises?.exam_task_types
  return {
    attemptId: row.id,
    attemptNumber: typeof row.attempt_number === 'number' ? row.attempt_number : null,
    restartedFromAttemptId: row.restarted_from_attempt_id ?? null,
    examId: examTask?.exam_type_id ?? null,
    examName: examTask?.exam_types?.name ?? null,
    examMaxScore: examTask?.exam_types?.max_score ?? null,
    taskTypeId: examTask?.id ?? null,
    taskCode: examTask?.task_code ?? null,
    taskName: examTask?.name ?? 'R&UoE',
    scorePercent: typeof row.score === 'number' ? row.score : null,
    maxScore: row.max_score ?? null,
    completedAt: row.completed_at ?? null,
  }
}

function mapRuoeMistakeRow(row: RuoeMistakeRow): NormalizedRuoeMistake {
  return {
    attemptId: row.attempt_id,
    attemptNumber: typeof row.attempt?.attempt_number === 'number' ? row.attempt.attempt_number : null,
    restartedFromAttemptId: row.attempt?.restarted_from_attempt_id ?? null,
    examId: row.attempt?.ruoe_exercises?.exam_task_types?.exam_type_id ?? null,
    exerciseId: row.attempt?.ruoe_exercises?.id ?? null,
    questionId: row.question_id,
    questionOrder: row.question?.order ?? null,
    questionText: row.question?.question_text ?? null,
    explanation: row.question?.explanation ?? null,
    userAnswer: row.user_answer ?? null,
    completedAt: row.attempt?.completed_at ?? null,
  }
}

export async function fetchStudentExamOptions(
  params: Omit<FetchStudentProgressParams, 'examId'>,
): Promise<StudentProgressSnapshot['availableExams']> {
  const snapshot = await fetchStudentProgress({ ...params, examId: null })
  return snapshot.availableExams
}
