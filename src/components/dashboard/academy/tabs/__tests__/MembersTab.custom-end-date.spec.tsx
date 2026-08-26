import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import MembersTab from '../MembersTab'

const invokeMock = vi.fn()

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    id,
    date,
    setDate,
  }: {
    id?: string
    date: Date | undefined
    setDate: (date: Date | undefined) => void
  }) => (
    <button type="button" id={id} onClick={() => setDate(new Date(2025, 1, 1))}>
      {date ? 'Selected date' : <span>Pick a date</span>}
    </button>
  ),
}))

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'admin-user' },
    activeAcademyId: 123,
    refreshUserProfile: vi.fn(),
  }),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}))

describe('MembersTab invite dialog subscription window', () => {
  beforeEach(() => {
    invokeMock.mockImplementation(async (name: string) => {
      if (name === 'admin-list-members') {
        return {
          data: {
            request_id: 'req-1',
            academy_id: 123,
            counts: { total: 0, awaiting_login: 0, active: 0, inactive: 0 },
            members: [],
            pagination: {
              page: 1,
              page_size: 25,
              total_members: 0,
              total_pages: 1,
            },
          },
          error: null,
        }
      }
      if (name === 'invite-members') {
        return {
          data: {
            request_id: 'req-invite',
            emails_total: 1,
            emails_created: 1,
            emails_resend: 0,
            emails_failed: 0,
          },
          error: null,
        }
      }
      return { data: {}, error: null }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('accepts optional subscription start/end inputs for student invites', async () => {
    render(<MembersTab />)

    const inviteButton = await screen.findByRole('button', { name: /invite members/i })
    fireEvent.click(inviteButton)

    const emailInput = await screen.findByLabelText(/email addresses/i)
    fireEvent.change(emailInput, { target: { value: 'student@example.com' } })

    const toggle = screen.getByRole('switch', { name: /enable custom subscription dates/i })
    fireEvent.click(toggle)
    screen.getByText(/Set specific start and end dates for access/i)

    const pickerLabels = screen.getAllByText(/pick a date/i)
    expect(pickerLabels).toHaveLength(2)

    const startPicker = pickerLabels[0].closest('button')
    const endPicker = pickerLabels[1].closest('button')
    expect(startPicker).toBeTruthy()
    expect(endPicker).toBeTruthy()

    fireEvent.click(startPicker as HTMLButtonElement)
    fireEvent.click(endPicker as HTMLButtonElement)

    const submit = screen.getByRole('button', { name: /send invites/i })
    fireEvent.click(submit)

    await waitFor(() => {
      const inviteCall = invokeMock.mock.calls.find(([fn]) => fn === 'invite-members')
      expect(inviteCall?.[1]).toMatchObject({
        body: expect.objectContaining({
          subscriptionStartDate: '2025-02-01',
          subscriptionEndDate: '2025-02-01',
        }),
      })
    })
  })
})
