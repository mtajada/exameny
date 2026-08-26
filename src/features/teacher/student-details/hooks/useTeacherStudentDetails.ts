import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/useAuth.ts'
import { supabase } from '@/integrations/supabase/client'
import type { Tables } from '@/integrations/supabase/types.ts'
import { getExamTaskMeta, isRuoeTask } from '@/utils/exam-task-meta.ts'
import {
  type TeacherAssignedTaskItem,
  type TeacherStudentDetailsPayload,
  type TeacherStudentProfile,
  type TeacherStudentWritingsGroups,
  type TeacherWritingItem,
  type WritingReviewStatus,
} from '@/features/teacher/student-details/types.ts'
import { teacherQueryKeys } from '@/hooks/teacher/queryKeys.ts'

interface ProfileRow {
  membership_id: number | string
  assigned_teacher_id: string | null
  target_exam_id: number | null
  target_level_id: number | null
  targetExam: Pick<Tables<'exam_types'>, 'id' | 'name' | 'max_score'> | null
  targetLevel: Pick<Tables<'levels'>, 'id' | 'name'> | null
  student: Pick<Tables<'profiles'>, 'id' | 'email' | 'full_name'> | null
  membership?: {
    academy_id?: number | null
    status?: string | null
  } | null
}

type SubmissionRow = Pick<
  Tables<'submissions'>,
  'id' | 'status' | 'submitted_at' | 'updated_at' | 'task_type_id' | 'time_spent_seconds' | 'assigned_prompt_id' | 'ai_generated_prompt_text'
> & {
  exam_task_types: Pick<Tables<'exam_task_types'>, 'id' | 'task_code' | 'name' | 'default_time_minutes'> | null
  evaluations: Pick<
    Tables<'evaluations'>,
    'ai_overall_score' | 'teacher_overall_score' | 'teacher_comments' | 'ai_overall_commentary' | 'evaluation_completed_at'
  > | null
}

type AssignedPromptRow = Pick<
  Tables<'assigned_prompts'>,
  'id' | 'status' | 'assigned_at' | 'ruoe_exercise_id' | 'task_type_id'
> & {
  exam_task_types: Pick<Tables<'exam_task_types'>, 'id' | 'task_code' | 'name'> | null
  submissions: Array<Pick<Tables<'submissions'>, 'id' | 'status' | 'submitted_at' | 'updated_at'>> | null
}

export interface UseTeacherStudentDetailsOptions {
  studentId?: string
  availableExams?: TeacherStudentProfile['availableExams']
}

export function useTeacherStudentDetails(options: UseTeacherStudentDetailsOptions) {
  const { studentId, availableExams } = options
  const { user, activeAcademyId, isLoading } = useAuth()
  const teacherId = user?.id ?? null
  const academyId = activeAcademyId ?? null
  const enabled = Boolean(studentId && teacherId && academyId && !isLoading)

  const query = useQuery({
    queryKey: teacherQueryKeys.studentDetails(teacherId ?? null, studentId ?? null, academyId),
    enabled,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<TeacherStudentDetailsPayload> => {
      if (!studentId || !teacherId || !academyId) {
        throw new Error('Missing identifiers to load student details.')
      }

      const profileRes = await supabase
        .from('student_profiles')
        .select(
          `
            membership_id,
            assigned_teacher_id,
            target_exam_id,
            target_level_id,
            targetExam:exam_types(id, name, max_score),
            targetLevel:levels(id, name),
            student:profiles!student_profiles_user_id_fkey(
              id,
              email,
              full_name
            ),
            membership:academy_memberships!inner(academy_id, status)
          `,
        )
        .eq('user_id', studentId)
        .eq('membership.academy_id', academyId)
        .eq('membership.status', 'active')
        .maybeSingle<ProfileRow>()

      if (profileRes.error) throw profileRes.error
      if (!profileRes.data) throw new Error('Student profile not found.')

      const profileRow = profileRes.data
      const membershipIdRaw = profileRow.membership_id
      const studentMembershipId =
        typeof membershipIdRaw === 'number'
          ? membershipIdRaw
          : Number.parseInt(String(membershipIdRaw), 10)

      if (!Number.isFinite(studentMembershipId)) {
        throw new Error('Student membership not found.')
      }

      if (profileRow.assigned_teacher_id !== teacherId) {
        throw new Error('You are not authorized to view this student.')
      }

      const [submissionsRes, promptsRes] = await Promise.all([
        supabase
          .from('submissions')
          .select(
            `
              id,
              status,
              submitted_at,
              updated_at,
              task_type_id,
              time_spent_seconds,
              assigned_prompt_id,
              ai_generated_prompt_text,
              exam_task_types!inner(id, task_code, name, default_time_minutes),
              evaluations(id, ai_overall_score, ai_overall_commentary, teacher_overall_score, teacher_comments, evaluation_completed_at)
            `,
          )
          .eq('student_membership_id', studentMembershipId)
          .neq('status', 'draft')
          .order('submitted_at', { ascending: false })
          .returns<SubmissionRow[]>(),
        supabase
          .from('assigned_prompts')
          .select(
            `
              id,
              status,
              assigned_at,
              ruoe_exercise_id,
              task_type_id,
              exam_task_types!inner(id, task_code, name),
              submissions(id, status, submitted_at, updated_at)
            `,
          )
          .eq('student_membership_id', studentMembershipId)
          .order('assigned_at', { ascending: false })
          .returns<AssignedPromptRow[]>(),
      ])

      if (submissionsRes.error) throw submissionsRes.error
      if (promptsRes.error) throw promptsRes.error

      const studentInfo = profileRow.student
      const profile: TeacherStudentProfile = {
        studentId,
        fullName:
          studentInfo?.full_name ??
          studentInfo?.email ??
          'Unnamed student',
        email: studentInfo?.email ?? null,
        targetExamId: profileRow.target_exam_id ?? null,
        targetExamName: profileRow.targetExam?.name ?? null,
        targetLevelId: profileRow.target_level_id ?? null,
        targetLevelName: profileRow.targetLevel?.name ?? null,
        assignedTeacherId: profileRow.assigned_teacher_id ?? null,
        availableExams: availableExams ?? [],
      }

      const writingGroups = mapSubmissions(submissionsRes.data ?? [])
      const assignedGroups = mapAssignedPrompts(promptsRes.data ?? [])

      return {
        profile,
        writings: writingGroups,
        assignedTasks: assignedGroups,
      }
    },
  })

  const data = query.data ?? null
  const error = query.error instanceof Error ? query.error.message : null

  return useMemo(
    () => ({
      details: data,
      loading: query.isLoading,
      refreshing: query.isRefetching,
      error,
      refetch: query.refetch,
    }),
    [data, error, query.isLoading, query.isRefetching, query.refetch],
  )
}

function mapSubmissions(rows: SubmissionRow[]): TeacherStudentWritingsGroups {
  const homeworkPending: TeacherWritingItem[] = []
  const homeworkReviewed: TeacherWritingItem[] = []
  const selfPracticePending: TeacherWritingItem[] = []
  const selfPracticeReviewed: TeacherWritingItem[] = []

  for (const row of rows) {
    const evaluation = row.evaluations
    const status = resolveWritingStatus(row.status, evaluation)
    const origin: TeacherWritingItem['origin'] = row.assigned_prompt_id ? 'assigned' : 'self_practice'
    const item: TeacherWritingItem = {
      submissionId: row.id,
      taskTypeId: row.exam_task_types?.id ?? null,
      taskCode: row.exam_task_types?.task_code ?? null,
      taskName: row.exam_task_types?.name ?? 'Untitled task',
      status,
      origin,
      assignedPromptId: row.assigned_prompt_id ?? null,
      submittedAt: row.submitted_at ?? null,
      updatedAt: row.updated_at ?? null,
      evaluationCompletedAt: evaluation?.evaluation_completed_at ?? null,
      aiOverallScore: parseNullableNumber(evaluation?.ai_overall_score),
      teacherOverallScore: parseNullableNumber(evaluation?.teacher_overall_score),
      aiOverallCommentary: evaluation?.ai_overall_commentary ?? null,
      teacherComments: evaluation?.teacher_comments ?? null,
      timeSpentSeconds: row.time_spent_seconds ?? null,
      defaultTimeMinutes: row.exam_task_types?.default_time_minutes ?? null,
    }

    const isPending = status === 'pending_teacher_review' || status === 'pending_ai_evaluation'

    if (isPending) {
      if (origin === 'assigned') homeworkPending.push(item)
      else selfPracticePending.push(item)
    } else if (status === 'teacher_reviewed') {
      if (origin === 'assigned') homeworkReviewed.push(item)
      else selfPracticeReviewed.push(item)
    }
  }

  return {
    homeworkPending,
    homeworkReviewed,
    selfPractice: {
      pending: selfPracticePending,
      reviewed: selfPracticeReviewed,
    },
  }
}

function mapAssignedPrompts(rows: AssignedPromptRow[]): TeacherStudentDetailsPayload['assignedTasks'] {
  const pending: TeacherAssignedTaskItem[] = []
  const completed: TeacherAssignedTaskItem[] = []

  for (const row of rows) {
    // Derive status from the most recent NON-DRAFT submission if any.
    const nonDraftSubs = (row.submissions ?? []).filter((s) => s.status !== 'draft')
    const latest = nonDraftSubs
      .map((s) => ({
        ...s,
        // Prefer updated_at for recency; fallback to submitted_at
        sortKey: new Date(s.updated_at ?? s.submitted_at ?? '1970-01-01').getTime(),
      }))
      .sort((a, b) => b.sortKey - a.sortKey)[0]

    const submission = latest ?? null
    const taskCategory = resolveTaskCategory(row)

    // If there is a non-draft submission, reflect its status; otherwise keep prompt status.
    const status: TeacherAssignedTaskItem['status'] = submission
      ? (submission.status === 'evaluated' ? 'evaluated' : 'submitted')
      : resolveAssignedPromptStatus(row.status)
    const item: TeacherAssignedTaskItem = {
      id: row.id,
      taskTypeId: row.task_type_id ?? null,
      taskCode: row.exam_task_types?.task_code ?? null,
      taskName: row.exam_task_types?.name ?? 'Assigned task',
      taskCategory,
      status,
      assignedAt: row.assigned_at,
      dueAt: null,
      submittedAt: submission?.submitted_at ?? null,
      submissionId: submission?.id ?? null,
    }

    if (status === 'pending' || status === 'viewed') {
      pending.push(item)
    } else {
      completed.push(item)
    }
  }

  return {
    pending,
    completed,
  }
}

function resolveWritingStatus(status: Tables<'submissions'>['status'], evaluation: SubmissionRow['evaluations']): WritingReviewStatus {
  if (status !== 'evaluated') return 'pending_ai_evaluation'
  const hasTeacherFeedback =
    Boolean(evaluation?.teacher_comments) || evaluation?.teacher_overall_score != null
  return hasTeacherFeedback ? 'teacher_reviewed' : 'pending_teacher_review'
}

function resolveAssignedPromptStatus(status: Tables<'assigned_prompts'>['status']): TeacherAssignedTaskItem['status'] {
  switch (status) {
    case 'pending':
    case 'viewed':
    case 'submitted':
    case 'evaluated':
      return status
    default:
      return 'pending'
  }
}

function resolveTaskCategory(row: AssignedPromptRow): TeacherAssignedTaskItem['taskCategory'] {
  if (row.ruoe_exercise_id) return 'ruoe'

  const taskCode = row.exam_task_types?.task_code ?? null
  const taskName = row.exam_task_types?.name ?? null
  if (isRuoeTask(taskCode ?? undefined, taskName ?? undefined)) return 'ruoe'
  if (!row.exam_task_types) return 'other'
  const meta = getExamTaskMeta(taskCode ?? undefined, taskName ?? undefined)

  return meta.skill === 'ruoe' ? 'ruoe' : 'writing'
}

function parseNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const trimmed = value.trim()
  if (!trimmed) return null
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : null
}

export default useTeacherStudentDetails

export { mapSubmissions, mapAssignedPrompts }
