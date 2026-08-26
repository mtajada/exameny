import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/useAuth.ts'
import type { TeacherClass } from './useTeacherClasses.ts'
import { getClassStudentSet, normalizeClassFilter, type ClassFilterValue } from './utils.ts'
import { teacherQueryKeys } from './queryKeys.ts'
import { buildTimeDisplayMeta, type TimeDisplayMeta } from '@/utils/time-format.ts'

export type TaskOriginFilter = 'teacher' | 'ai' | 'all'

export interface PendingReviewRow {
  submission_id: string
  updated_at: string
  submission_date_display: string
  student_id: string
  student_name: string
  task_name: string
  assigned_prompt_id: string | null
  ai_generated_prompt_text: string | null
  actual_time_seconds: number | null
  suggested_minutes: number | null
  timeMeta: TimeDisplayMeta
}

type SubmissionRow = {
  id: string
  updated_at: string
  assigned_prompt_id: string | null
  ai_generated_prompt_text: string | null
  time_spent_seconds: number | null
  student_membership_id: number | string | null
  task: { name: string | null; default_time_minutes: number | null } | null
  evaluation: {
    teacher_comments: string | null
    teacher_overall_score: string | null
  } | null
}

type StudentProfileRow = {
  membership_id: number | string
  user_id: string | null
  student: {
    id: string | null
    full_name?: string | null
    email?: string | null
  } | null
  membership?: {
    academy_id?: number | null
    status?: string | null
  } | null
}

interface UsePendingReviewsOptions {
  taskType?: string | 'all'
  origin?: TaskOriginFilter
  search?: string
  classFilterId?: ClassFilterValue
  classes?: TeacherClass[]
}

export function usePendingReviews(options?: UsePendingReviewsOptions) {
  const { user, activeAcademyId, isLoading } = useAuth()
  const teacherId = user?.id ?? null
  const academyId = activeAcademyId ?? null
  const queryEnabled = Boolean(teacherId && academyId && !isLoading)

  const query = useQuery({
    queryKey: teacherQueryKeys.pendingReviews(teacherId ?? null, academyId),
    queryFn: async (): Promise<PendingReviewRow[]> => {
      if (!queryEnabled || !teacherId || !academyId) return []

      const { data: assignedProfiles, error: profileError } = await supabase
        .from('student_profiles')
        .select(`
          membership_id,
          user_id,
          student:profiles!student_profiles_user_id_fkey(
            id,
            full_name,
            email
          ),
          membership:academy_memberships!inner(academy_id, status)
        `)
        .eq('assigned_teacher_id', teacherId)
        .eq('membership.academy_id', academyId)
        .eq('membership.status', 'active')
        .returns<StudentProfileRow[]>()

      if (profileError) throw profileError

      const membershipMap = new Map<number, { studentId: string; fullName: string }>()
      for (const row of assignedProfiles ?? []) {
        const rawMembershipId = row.membership_id
        const membershipId =
          typeof rawMembershipId === 'number'
            ? rawMembershipId
            : Number.parseInt(String(rawMembershipId), 10)

        if (!Number.isFinite(membershipId)) {
          console.warn('[usePendingReviews] Skipping profile with invalid membership_id')
          continue
        }

        const studentId = row.student?.id ?? row.user_id ?? ''
        const fullName =
          row.student?.full_name ??
          row.student?.email ??
          'Name not available'

        membershipMap.set(membershipId, { studentId, fullName })
      }

      if (membershipMap.size === 0) {
        return []
      }

      const membershipIds = Array.from(membershipMap.keys())

      const { data, error: qErr } = await supabase
        .from('submissions')
        .select(`
          id,
          updated_at,
          assigned_prompt_id,
          ai_generated_prompt_text,
          time_spent_seconds,
          student_membership_id,
          task: exam_task_types!inner ( name, default_time_minutes ),
          evaluation: evaluations!inner ( teacher_comments, teacher_overall_score )
        `)
        .eq('status', 'evaluated')
        .in('student_membership_id', membershipIds)
        .is('evaluation.teacher_comments', null)
        .is('evaluation.teacher_overall_score', null)
        .order('updated_at', { ascending: true })

      if (qErr) throw qErr

      const formatted = (data ?? []).flatMap((row: SubmissionRow) => {
        const rawMembershipId = row.student_membership_id
        const membershipId =
          typeof rawMembershipId === 'number'
            ? rawMembershipId
            : rawMembershipId != null
              ? Number.parseInt(String(rawMembershipId), 10)
              : null

        if (membershipId == null || !membershipMap.has(membershipId)) {
          return []
        }

        const studentInfo = membershipMap.get(membershipId)!

        return [{
          submission_id: row.id,
          updated_at: row.updated_at,
          submission_date_display: new Date(row.updated_at).toLocaleDateString('en-US', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          }),
          student_id: studentInfo.studentId,
          student_name: studentInfo.fullName,
          task_name: row.task?.name || 'Unknown Task',
          assigned_prompt_id: row.assigned_prompt_id,
          ai_generated_prompt_text: row.ai_generated_prompt_text,
          actual_time_seconds: typeof row.time_spent_seconds === 'number' ? row.time_spent_seconds : null,
          suggested_minutes: row.task?.default_time_minutes ?? null,
          timeMeta: buildTimeDisplayMeta(row.time_spent_seconds, row.task?.default_time_minutes ?? null),
        }]
      })

      return formatted
    },
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  const error = query.error instanceof Error ? query.error.message : null

  const search = useMemo(() => (options?.search || '').toLowerCase().trim(), [options?.search])
  const taskType = useMemo(() => (options?.taskType && options.taskType !== 'all' ? options.taskType : null), [options?.taskType])
  const origin = options?.origin ?? 'all'
  const classId = useMemo(() => normalizeClassFilter(options?.classFilterId), [options?.classFilterId])
  const classStudentSet = useMemo(() => getClassStudentSet(options?.classes, classId), [options?.classes, classId])

  const filtered = useMemo(() => {
    let result = rows

    if (taskType) {
      result = result.filter((row) => row.task_name === taskType)
    }

    if (origin === 'teacher') {
      result = result.filter((row) => row.assigned_prompt_id !== null)
    } else if (origin === 'ai') {
      result = result.filter((row) => row.ai_generated_prompt_text !== null)
    }

    if (search) {
      result = result.filter((row) => row.student_name.toLowerCase().includes(search))
    }

    if (classStudentSet) {
      result = result.filter((row) => classStudentSet.has(row.student_id))
    }

    return result
  }, [rows, taskType, origin, search, classStudentSet])

  const taskTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.task_name))).sort(), [rows])

  return {
    rows,
    filtered,
    taskTypes,
    loading: query.isPending,
    error,
    refetch: query.refetch,
  }
}

export default usePendingReviews
