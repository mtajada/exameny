import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/useAuth.ts'
import { teacherQueryKeys } from './queryKeys.ts'

export interface TeacherStudent {
  id: string
  membershipId: number
  fullName: string
  email: string
  targetExamId: number | null
  targetExamName: string | null
  targetLevelId: number | null
  targetLevelName: string | null
}

export function useTeacherRoster(enabled: boolean = true) {
  const { user, activeAcademyId, isLoading } = useAuth()
  const teacherId = user?.id ?? null
  const academyId = activeAcademyId ?? null

  const queryEnabled = Boolean(enabled && !isLoading && teacherId && academyId)

  const query = useQuery({
    queryKey: teacherQueryKeys.roster(teacherId ?? null, academyId),
    queryFn: async (): Promise<TeacherStudent[]> => {
      if (!queryEnabled || !teacherId || !academyId) return []

      const { data, error } = await supabase
        .from('student_profiles')
        .select(`
          user_id,
          membership_id,
          target_exam_id,
          target_level_id,
          exam:exam_types(name),
          level:levels(name),
          membership:academy_memberships!inner(academy_id, status),
          profiles:profiles!student_profiles_user_id_fkey!inner(
            id,
            email,
            full_name
          )
        `)
        .eq('assigned_teacher_id', teacherId)
        .eq('membership.academy_id', academyId)
        .eq('membership.status', 'active')

      if (error) throw error

      const normalized = (data ?? []).map((row) => ({
        id: row.profiles?.id || row.user_id,
        membershipId: row.membership_id,
        fullName:
          row.profiles?.full_name ??
          row.profiles?.email ??
          'Name not available',
        email: row.profiles?.email ?? '—',
        targetExamId: row.target_exam_id ?? null,
        targetExamName: row.exam?.name ?? null,
        targetLevelId: row.target_level_id ?? null,
        targetLevelName: row.level?.name ?? null,
      }))

      return normalized.sort((a, b) =>
        a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }),
      )
    },
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })

  const students = useMemo(() => query.data ?? [], [query.data])
  const errorMessage = query.error instanceof Error ? query.error.message : null

  return {
    students,
    loading: query.isPending,
    error: errorMessage,
    refetch: query.refetch,
  }
}

export default useTeacherRoster
