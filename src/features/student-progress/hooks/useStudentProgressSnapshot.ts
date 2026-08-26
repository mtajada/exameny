import { useMemo } from 'react'
import {
  keepPreviousData,
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { fetchStudentProgress } from '@/features/student-progress/api/fetchStudentProgress.ts'
import type { StudentProgressSnapshot } from '@/features/student-progress/types.ts'

export interface UseStudentProgressSnapshotOptions {
  studentId?: string | null
  academyId?: number | null
  examId?: number | string | null
  requestingTeacherId?: string | null
  enabled?: boolean
  queryKey?: QueryKey
  staleTimeMs?: number
}

export interface StudentProgressSnapshotState {
  snapshot: StudentProgressSnapshot | null
  availableExams: StudentProgressSnapshot['availableExams']
  loading: boolean
  refreshing: boolean
  error: string | null
  refetch: UseQueryResult<StudentProgressSnapshot, Error>['refetch']
}

export function useStudentProgressSnapshot(options: UseStudentProgressSnapshotOptions): StudentProgressSnapshotState {
  const {
    studentId,
    examId,
    academyId = null,
    requestingTeacherId,
    enabled,
    queryKey,
    staleTimeMs = 1000 * 60 * 2,
  } = options

  const baseEnabled = enabled ?? Boolean(studentId && academyId !== null)
  const computedEnabled = Boolean(baseEnabled && studentId && academyId !== null)

  const resolvedQueryKey: QueryKey =
    queryKey ??
    ([
      'student-progress',
      requestingTeacherId ?? 'self',
      studentId ?? 'anonymous',
      academyId ?? 'no-academy',
      examId ?? 'any',
    ] as const)

  const queryOptions: UseQueryOptions<StudentProgressSnapshot, Error, StudentProgressSnapshot, QueryKey> = {
    queryKey: resolvedQueryKey,
    enabled: computedEnabled,
    queryFn: (): Promise<StudentProgressSnapshot> => {
      if (!studentId) {
        throw new Error('Student identifier is required to load progress data.')
      }
      if (academyId === null) {
        throw new Error('Academy context is required to load progress data.')
      }

      if (requestingTeacherId) {
        return fetchStudentProgress({ studentId, examId, requestingTeacherId, academyId })
      }

      return fetchStudentProgress({ studentId, examId, academyId })
    },
    staleTime: staleTimeMs,
    placeholderData: keepPreviousData,
  }

  const query = useQuery<StudentProgressSnapshot, Error>(queryOptions)
  const snapshot: StudentProgressSnapshot | null = query.data ?? null
  const errorMessage = query.error instanceof Error ? query.error.message : null

  return useMemo<StudentProgressSnapshotState>(
    () => ({
      snapshot,
      availableExams: snapshot?.availableExams ?? [],
      loading: query.isLoading,
      refreshing: query.isRefetching,
      error: errorMessage,
      refetch: query.refetch,
    }),
    [snapshot, query.isLoading, query.isRefetching, errorMessage, query.refetch],
  )
}

export default useStudentProgressSnapshot
