import React from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { useTeacherRoster } from '../useTeacherRoster.ts'
import { usePendingReviews } from '../usePendingReviews.ts'
import { useAssignedStudents } from '../useAssignedStudents.ts'

const mockUseQuery = vi.fn((_options: unknown) => ({
  data: [],
  error: null,
  isPending: false,
  refetch: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}))

type MockAuthState = {
  user: { id: string } | null
  activeAcademyId: number | null
  isLoading: boolean
}

let mockAuthState: MockAuthState

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => mockAuthState,
}))

const HookHarness = ({ hook }: { hook: () => void }) => {
  hook()
  return null
}

describe('teacher hooks respect active academy switching', () => {
  beforeEach(() => {
    mockAuthState = {
      user: { id: 'teacher-1' },
      activeAcademyId: 101,
      isLoading: false,
    }
    mockUseQuery.mockClear()
  })

  const expectLatestQueryKey = (expectedKey: unknown[], expectedEnabled: boolean = true) => {
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: expectedKey,
        enabled: expectedEnabled,
      }),
    )
  }

  it('useTeacherRoster refreshes query key when the academy changes', () => {
    const { rerender } = render(<HookHarness hook={() => useTeacherRoster()} />)
    expectLatestQueryKey(['teacher', 'roster', 'teacher-1', 101])

    mockUseQuery.mockClear()
    mockAuthState.activeAcademyId = 202
    rerender(<HookHarness hook={() => useTeacherRoster()} />)
    expectLatestQueryKey(['teacher', 'roster', 'teacher-1', 202])
  })

  it('useTeacherRoster disables querying when academy context is missing', () => {
    mockAuthState.activeAcademyId = null
    render(<HookHarness hook={() => useTeacherRoster()} />)
    expectLatestQueryKey(['teacher', 'roster', 'teacher-1', 'no-academy'], false)
  })

  it('usePendingReviews refreshes query key when the academy changes', () => {
    const { rerender } = render(<HookHarness hook={() => usePendingReviews()} />)
    expectLatestQueryKey(['teacher', 'pending-reviews', 'teacher-1', 101])

    mockUseQuery.mockClear()
    mockAuthState.activeAcademyId = 555
    rerender(<HookHarness hook={() => usePendingReviews()} />)
    expectLatestQueryKey(['teacher', 'pending-reviews', 'teacher-1', 555])
  })

  it('usePendingReviews disables querying when academy context is missing', () => {
    mockAuthState.activeAcademyId = null
    render(<HookHarness hook={() => usePendingReviews()} />)
    expectLatestQueryKey(['teacher', 'pending-reviews', 'teacher-1', 'no-academy'], false)
  })

  it('useAssignedStudents refreshes query key when the academy changes', () => {
    const { rerender } = render(<HookHarness hook={() => useAssignedStudents()} />)
    expectLatestQueryKey(['teacher', 'assigned-students', 'teacher-1', 101])

    mockUseQuery.mockClear()
    mockAuthState.activeAcademyId = 999
    rerender(<HookHarness hook={() => useAssignedStudents()} />)
    expectLatestQueryKey(['teacher', 'assigned-students', 'teacher-1', 999])
  })

  it('useAssignedStudents disables querying when academy context is missing', () => {
    mockAuthState.activeAcademyId = null
    render(<HookHarness hook={() => useAssignedStudents()} />)
    expectLatestQueryKey(['teacher', 'assigned-students', 'teacher-1', 'no-academy'], false)
  })
})
