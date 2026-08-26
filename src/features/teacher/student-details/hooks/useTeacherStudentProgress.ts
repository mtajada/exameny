import { useAuth } from '@/contexts/useAuth.ts'
import { useStudentProgressSnapshot, type StudentProgressSnapshotState } from '@/features/student-progress/index.ts'
import { teacherQueryKeys } from '@/hooks/teacher/queryKeys.ts'

export function useTeacherStudentProgress(studentId?: string, examId?: number | string | null): StudentProgressSnapshotState {
  const { user, activeAcademyId, isLoading } = useAuth()
  const teacherId = user?.id ?? null
  const academyId = activeAcademyId ?? null
  const enabled = Boolean(teacherId && studentId && academyId && !isLoading)

  return useStudentProgressSnapshot({
    studentId,
    examId,
    requestingTeacherId: teacherId ?? undefined,
    academyId,
    enabled,
    queryKey: teacherQueryKeys.studentProgress(teacherId ?? null, studentId ?? null, academyId, examId ?? 'any'),
  })
}

export default useTeacherStudentProgress
