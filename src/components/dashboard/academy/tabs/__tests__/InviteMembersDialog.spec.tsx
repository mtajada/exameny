import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { InviteMembersDialog } from '../InviteMembersDialog'

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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}))

const baseProps = {
  open: true,
  mode: 'create' as const,
  activeAcademyId: 101,
  defaultEmails: ['student@example.com'],
  defaultRole: 'student' as const,
  membershipContext: null,
  onOpenChange: vi.fn(),
  onCompleted: vi.fn(),
  onError: vi.fn(),
  resolveExistingMembership: () => null,
}

describe('InviteMembersDialog', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue({ data: { request_id: 'req-1' }, error: null })
  })

  it('shows default subscription description when custom dates toggle is off', () => {
    render(<InviteMembersDialog {...baseProps} />)

    screen.getByText(/Default: 12-month access from activation/i)
    screen.getByRole('switch', { name: /enable custom subscription dates/i })
  })

  it('validates optional subscription end date requires start date', async () => {
    render(<InviteMembersDialog {...baseProps} />)

    // Enable custom dates toggle
    const toggle = screen.getByRole('switch', { name: /enable custom subscription dates/i })
    fireEvent.click(toggle)

    // Verify toggle reveals custom dates section
    screen.getByText(/Set specific start and end dates for access/i)

    const pickerLabels = screen.getAllByText(/pick a date/i)
    expect(pickerLabels).toHaveLength(2)
    const endPicker = pickerLabels[1].closest('button')
    expect(endPicker).toBeTruthy()
    fireEvent.click(endPicker as HTMLButtonElement)

    fireEvent.click(screen.getByRole('button', { name: /send invites/i }))

    await screen.findByText(/Subscription end date requires a start date/i)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('surfaces duplicate details from backend payload when local cache is stale', async () => {
    const resolveExistingMembership = vi.fn().mockReturnValue(null)

    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'duplicate',
        context: {
          code: 'INVITATION_ALREADY_EXISTS',
          request_id: 'req-dup',
          details: {
            membership_id: 42,
            email: 'student@example.com',
            role: 'student',
            status: 'awaiting_login',
            subscription_start_date: '2025-01-01',
            subscription_end_date: '2025-12-31',
          },
        },
      },
    })

    render(
      <InviteMembersDialog
        {...baseProps}
        resolveExistingMembership={resolveExistingMembership}
        defaultEmails={['student@example.com']}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send invites/i }))

    await waitFor(() => screen.getByText(/^Invitation already exists$/i))

    const duplicateAlert = screen.getByText(/^Invitation already exists$/i).closest('[role="alert"]') as HTMLElement

    expect(duplicateAlert).toBeTruthy()
    within(duplicateAlert).getByText(/Resend action/i)
    within(duplicateAlert).getByText(/student@example.com/i)
    within(duplicateAlert).getByText(/Status Awaiting login/i)
    within(duplicateAlert).getByText(/Window/i)
    within(duplicateAlert).getByText(/January 1st, 2025/i)
    within(duplicateAlert).getByText(/December 31st, 2025/i)
  })

  it('shows the mandated role conflict copy when the Edge Function returns ROLE_CONFLICT', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'role conflict',
        context: {
          code: 'ROLE_CONFLICT',
          request_id: 'req-role-conflict',
          details: { current_role: 'teacher', requested_role: 'student' },
        },
      },
    })

    render(<InviteMembersDialog {...baseProps} />)

    fireEvent.change(screen.getByLabelText(/email addresses/i), { target: { value: 'teacher@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send invites/i }))

    await screen.findByText(/This email is already linked to teacher/i)
    screen.getByText(/Use a different account to invite them as student/i)
  })

  it('renders invite summary showing zero created records when resending invites', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        request_id: 'req-resend',
        emails_total: 1,
        emails_created: 0,
        emails_resend: 1,
        emails_failed: 0,
      },
      error: null,
    })

    const onCompleted = vi.fn()

    render(
      <InviteMembersDialog
        {...baseProps}
        mode="resend"
        membershipContext={{
          id: 200,
          email: 'student@example.com',
          role: 'student',
          status: 'awaiting_login',
          subscription_start_date: '2025-01-01',
          subscription_end_date: '2025-12-31',
        }}
        onCompleted={onCompleted}
      />,
    )

    const submit = await screen.findByRole('button', { name: /resend invite/i })
    fireEvent.click(submit)

    await screen.findByText(/Created 0 records · resent 1/i)
    expect(onCompleted).toHaveBeenCalledWith({
      request_id: 'req-resend',
      emails_total: 1,
      emails_created: 0,
      emails_resend: 1,
      emails_failed: 0,
    })
  })

  it('prefills resend mode, hides date editors, and previews the stored subscription window', () => {
    render(
      <InviteMembersDialog
        {...baseProps}
        mode="resend"
        membershipContext={{
          id: 201,
          email: 'resend@example.com',
          role: 'student',
          status: 'awaiting_login',
          subscription_start_date: '2025-02-01',
          subscription_end_date: '2025-12-31',
        }}
      />,
    )

    const emailInput = screen.getByDisplayValue('resend@example.com') as HTMLInputElement
    expect(emailInput.value).toBe('resend@example.com')
    expect(emailInput.readOnly).toBe(true)
    expect(screen.queryByLabelText(/subscription start/i)).toBeNull()
    expect(screen.queryByLabelText(/subscription end/i)).toBeNull()
    screen.getByText(/Existing subscription window/i)
    screen.getByText(/February 1st, 2025/i)
    screen.getByText(/December 31st, 2025/i)
  })

  it('renders invite summary counts after creating invites', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        request_id: 'req-create',
        emails_total: 2,
        emails_created: 2,
        emails_resend: 0,
        emails_failed: 1,
      },
      error: null,
    })

    const onCompleted = vi.fn()

    render(<InviteMembersDialog {...baseProps} onCompleted={onCompleted} />)

    fireEvent.change(screen.getByLabelText(/email addresses/i), {
      target: { value: 'one@example.com\ntwo@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send invites/i }))

    await screen.findByText(/Processed 2 emails/i)
    screen.getByText(/Created 2 records · resent 0/i)
    screen.getByText(/Failures reported: 1/i)
    expect(onCompleted).toHaveBeenCalledWith({
      request_id: 'req-create',
      emails_total: 2,
      emails_created: 2,
      emails_resend: 0,
      emails_failed: 1,
    })
  })
})
