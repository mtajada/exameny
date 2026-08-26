import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/useAuth.ts'
import type { TeacherClass } from './useTeacherClasses.ts'
import { getClassStudentSet, normalizeClassFilter, type ClassFilterValue } from './utils.ts'
import { teacherQueryKeys } from './queryKeys.ts'

type AssignedStudentRow = {
  user_id: string | null
  membership_id: number | string | null
  student: {
    id: string | null
    full_name?: string | null
    email?: string | null
  } | null
  exam?: { name: string | null } | null
  membership?: {
    academy_id?: number | null
    status?: string | null
  } | null
}

export interface AssignedStudent {
  student_id: string
  full_name: string
  target_exam_name: string | null
}

interface UseAssignedStudentsOptions {
  search?: string
  examFilter?: string
  classFilterId?: ClassFilterValue
  classes?: TeacherClass[]
}

export function useAssignedStudents(options?: UseAssignedStudentsOptions) {
  const { user, activeAcademyId, isLoading } = useAuth()
  const teacherId = user?.id ?? null
  const academyId = activeAcademyId ?? null
  const queryEnabled = Boolean(teacherId && academyId && !isLoading)

  const query = useQuery({
    queryKey: teacherQueryKeys.assignedStudents(teacherId ?? null, academyId),
    queryFn: async (): Promise<AssignedStudent[]> => {
      if (!queryEnabled || !teacherId || !academyId) return []

      const { data, error: qErr } = await supabase
        .from('student_profiles')
        .select(
          `
            user_id,
            membership_id,
            student:profiles!student_profiles_user_id_fkey(
              id,
              full_name,
              email
            ),
            exam:exam_types!student_profiles_target_exam_id_fkey(name),
            membership:academy_memberships!inner(academy_id, status)
          `,
        )
        .eq('assigned_teacher_id', teacherId)
        .eq('membership.academy_id', academyId)
        .eq('membership.status', 'active')
        .returns<AssignedStudentRow[]>()

      if (qErr) throw qErr

      const normalized = (data ?? [])
        .map((row) => {
          const fullName =
            row.student?.full_name ??
            row.student?.email ??
            'Name not available'
          return {
            student_id: row.student?.id || row.user_id,
            full_name: fullName,
            target_exam_name: row.exam?.name ?? null,
          }
        })
        .sort((a, b) =>
          a.full_name.localeCompare(b.full_name, undefined, {
            sensitivity: 'base',
          }),
        )

      return normalized
    },
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })

  const students = useMemo(() => query.data ?? [], [query.data])
  const error = query.error instanceof Error ? query.error.message : null

  const search = useMemo(() => (options?.search || '').toLowerCase().trim(), [options?.search])
  const examFilter = useMemo(() => (options?.examFilter && options.examFilter !== 'all' ? options.examFilter : null), [options?.examFilter])
  const classId = useMemo(() => normalizeClassFilter(options?.classFilterId), [options?.classFilterId])
  const classStudentSet = useMemo(() => getClassStudentSet(options?.classes, classId), [options?.classes, classId])

  const filtered = useMemo(() => {
    let result = students

    if (examFilter) {
      result = result.filter((student) => (student.target_exam_name || '') === examFilter)
    }

    if (search) {
      result = result.filter((student) => student.full_name.toLowerCase().includes(search))
    }

    if (classStudentSet) {
      result = result.filter((student) => classStudentSet.has(student.student_id))
    }

    return result
  }, [students, examFilter, search, classStudentSet])

  return {
    students,
    filtered,
    loading: query.isPending,
    error,
    refetch: query.refetch,
  }
}

export default useAssignedStudents
