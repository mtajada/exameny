import React from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { useStudentProgressSnapshot } from '../useStudentProgressSnapshot.ts'

const mockUseQuery = vi.fn((_options?: unknown) => ({
  data: null,
  error: null,
  isLoading: false,
  isRefetching: false,
  refetch: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  keepPreviousData: Symbol('keep-previous'),
}))

vi.mock('@/features/student-progress/api/fetchStudentProgress', () => ({
  fetchStudentProgress: vi.fn(),
}))

const SnapshotHarness = ({ academyId }: { academyId: number | null }) => {
  useStudentProgressSnapshot({
    studentId: 'student-1',
    academyId,
    examId: 'B2',
    enabled: true,
  })
  return null
}

describe('useStudentProgressSnapshot academy switching', () => {
  beforeEach(() => {
    mockUseQuery.mockClear()
  })

  it('includes academy identifier in the query key and refreshes when it changes', () => {
    const { rerender } = render(<SnapshotHarness academyId={11} />)
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['student-progress', 'self', 'student-1', 11, 'B2'],
        enabled: true,
      }),
    )

    mockUseQuery.mockClear()
    rerender(<SnapshotHarness academyId={42} />)
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['student-progress', 'self', 'student-1', 42, 'B2'],
        enabled: true,
      }),
    )
  })

  it('disables querying when academy context is missing', () => {
    render(<SnapshotHarness academyId={null} />)
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['student-progress', 'self', 'student-1', 'no-academy', 'B2'],
        enabled: false,
      }),
    )
  })
})
