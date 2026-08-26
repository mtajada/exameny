import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthContextType } from '@/contexts/AuthContextBase.ts'
import { useAuth } from '@/contexts/useAuth.ts'
import { supabase } from '@/integrations/supabase/client'
import EditorPage from '@/pages/EditorPage.tsx'

vi.mock('@/contexts/useAuth.ts', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}))

vi.mock('@/hooks/useSubmissionTimer.ts', () => ({
  useSubmissionTimer: () => ({
    formatted: '00:00',
    isSyncing: false,
    syncWithServer: vi.fn().mockResolvedValue({ seconds: 0, updated: false, skipped: true }),
    getTotalSeconds: () => 0,
    markSynced: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  }),
}))

vi.mock('@/components/writing/index.ts', () => ({
  WritingEditorPanel: () => <div data-testid="writing-editor" />,
  WritingRightPanel: () => <div data-testid="writing-right" />,
}))

const useAuthMock = vi.mocked(useAuth)

const buildUser = (overrides: Partial<AuthContextType['user']> = {}): AuthContextType['user'] => ({
  id: 'user-1',
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
  app_metadata: {},
  user_metadata: {},
  ...overrides,
})

const baseAuthContext: AuthContextType = {
  session: null,
  user: null,
  profile: null,
  role: null,
  platformRole: null,
  isPlatformAdmin: false,
  activeAcademyId: null,
  activeMembershipId: null,
  userPreferences: null,
  memberships: [],
  membershipsInactive: [],
  isInitialSetupCompleted: false,
  isProcessingAuth: false,
  finalizeStatus: 'idle',
  lastFinalizeError: null,
  lastFinalizeRequestId: null,
  isLoading: false,
  error: null,
  isProfileComplete: null,
  isNameRequired: false,
  logout: vi.fn().mockResolvedValue({ error: null }),
  updateProfileCompletionStatus: vi.fn(),
  refreshUserProfile: vi.fn().mockResolvedValue(undefined),
  retryFinalize: vi.fn().mockResolvedValue(undefined),
  selectActiveAcademy: vi.fn().mockResolvedValue({ error: null }),
}

const buildAuthContext = (overrides: Partial<AuthContextType>): AuthContextType => ({
  ...baseAuthContext,
  ...overrides,
})

describe('EditorPage membership gating', () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    vi.mocked(supabase.from).mockReset()
  })

  it('loads a draft by submissionId even when activeMembershipId is null', async () => {
    useAuthMock.mockReturnValue(buildAuthContext({
      user: buildUser({ id: 'user-1' }),
      activeMembershipId: null,
      isLoading: false,
      isProcessingAuth: false,
      finalizeStatus: 'success',
    }))

    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'sub-1',
          student_membership_id: null,
          submission_text: 'Hello world',
          word_count: 2,
          time_spent_seconds: 0,
          task_type_id: 10,
          ai_generated_prompt_text: null,
          assigned_prompt: {
            prompt_text: 'Write about your day.',
            taskType: { default_time_minutes: 30, exam_id: 1, level_id: 1 },
          },
        },
        error: null,
      }),
    }

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table !== 'submissions') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return query as ReturnType<typeof supabase.from>
    })

    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/editor', state: { submissionId: 'sub-1' } },
        ]}
      >
        <Routes>
          <Route path="/editor" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(query.or).toHaveBeenCalledWith(
      'and(student_membership_id.is.null,student_id.eq.user-1)',
    )
    expect(await screen.findByTestId('writing-editor')).toBeInTheDocument()
  })

  it('shows an error (no infinite spinner) when activeMembershipId is null for assigned prompts', async () => {
    useAuthMock.mockReturnValue(buildAuthContext({
      user: buildUser({ id: 'user-1' }),
      activeMembershipId: null,
      isLoading: false,
      isProcessingAuth: false,
      finalizeStatus: 'success',
    }))

    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/editor', state: { assignedPromptId: 'ap-1' } },
        ]}
      >
        <Routes>
          <Route path="/editor" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Error Loading Editor')).toBeInTheDocument()
    expect(screen.getByText('Could not determine your academy membership. Please try again.')).toBeInTheDocument()
    expect(vi.mocked(supabase.from)).not.toHaveBeenCalled()
  })

  it('loads a draft by submissionId scoped to activeMembershipId', async () => {
    useAuthMock.mockReturnValue(buildAuthContext({
      user: buildUser({ id: 'user-1' }),
      activeMembershipId: 42,
      isLoading: false,
      isProcessingAuth: false,
      finalizeStatus: 'success',
    }))

    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'sub-1',
          student_membership_id: 42,
          submission_text: 'Hello world',
          word_count: 2,
          time_spent_seconds: 0,
          task_type_id: 10,
          ai_generated_prompt_text: null,
          assigned_prompt: {
            prompt_text: 'Write about your day.',
            taskType: { default_time_minutes: 30, exam_id: 1, level_id: 1 },
          },
        },
        error: null,
      }),
    }

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table !== 'submissions') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return query as ReturnType<typeof supabase.from>
    })

    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/editor', state: { submissionId: 'sub-1' } },
        ]}
      >
        <Routes>
          <Route path="/editor" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(query.or).toHaveBeenCalledWith(
      'student_membership_id.eq.42,and(student_membership_id.is.null,student_id.eq.user-1)',
    )
    expect(await screen.findByTestId('writing-editor')).toBeInTheDocument()
  })
})
