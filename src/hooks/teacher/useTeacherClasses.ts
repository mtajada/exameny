import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/useAuth.ts'
import { teacherQueryKeys } from './queryKeys.ts'

export interface TeacherClass {
  id: number
  name: string
  description: string | null
  studentUserIds: string[]
}

export function useTeacherClasses(enabled: boolean = true) {
  const { user, activeAcademyId, isLoading } = useAuth()

  const academyId = activeAcademyId ?? null
  const queryEnabled = Boolean(enabled && !isLoading && user?.id && academyId)

  const query = useQuery({
    queryKey: teacherQueryKeys.classes(academyId),
    queryFn: async (): Promise<TeacherClass[]> => {
      if (!queryEnabled || !academyId) return []

      const { data: academyClasses, error: classesError } = await supabase
        .from('classes')
        .select('id, name, description')
        .eq('academy_id', academyId)

      if (classesError) throw classesError

      const classIds = (academyClasses ?? []).map((cls) => cls.id)

      const byClass: Record<number, string[]> = {}

      if (classIds.length > 0) {
        const { data: cmData, error: cmError } = await supabase
          .from('class_members')
          .select(`
            class_id,
            academy_memberships!inner(
              role,
              user_id,
              academy_id,
              status
            )
          `)
          .in('class_id', classIds)
          .eq('academy_memberships.role', 'student')
          .eq('academy_memberships.academy_id', academyId)
          .eq('academy_memberships.status', 'active')

        if (cmError) throw cmError

        for (const membership of cmData ?? []) {
          const classId = membership.class_id
          const assignedUserId = membership.academy_memberships?.user_id
          if (!assignedUserId) continue
          if (!byClass[classId]) byClass[classId] = []
          byClass[classId].push(assignedUserId)
        }
      }

      return (academyClasses ?? []).map((cls) => ({
        id: cls.id,
        name: cls.name,
        description: cls.description ?? null,
        studentUserIds: byClass[cls.id] ?? [],
      }))
    },
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })

  const classes = useMemo(() => query.data ?? [], [query.data])
  const error = query.error instanceof Error ? query.error.message : null

  return {
    classes,
    loading: query.isPending,
    error,
    refetch: query.refetch,
  }
}

export default useTeacherClasses
