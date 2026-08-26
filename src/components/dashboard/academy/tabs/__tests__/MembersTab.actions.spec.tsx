import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'

vi.mock('@/components/ui/select', () => {
  const SelectContext = React.createContext<{ value: string; onChange: (value: string) => void }>({
    value: '',
    onChange: () => {},
  })

  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => <SelectContext.Provider value={{ value, onChange: onValueChange }}>{children}</SelectContext.Provider>

  const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ children, ...props }, ref) => {
      const { value } = React.useContext(SelectContext)
      return (
        <button type="button" role="combobox" ref={ref} {...props}>
          {value || children}
        </button>
      )
    },
  )

  const SelectContent = ({ children }: { children: React.ReactNode }) => <div>{children}</div>

  const SelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => {
    const { onChange } = React.useContext(SelectContext)
    return (
      <button type="button" role="option" onClick={() => onChange(value)}>
        {children}
      </button>
    )
  }

  const SelectValue = ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ''}</span>

  return {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
  }
})

import MembersTab, { type AcademyMember } from '../MembersTab'

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const invokeMock = vi.fn()
const refreshProfileMock = vi.fn()
const refreshSessionMock = vi.fn()

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'admin-user' },
    activeAcademyId: 123,
    refreshUserProfile: refreshProfileMock,
  }),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    auth: {
      refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
    },
  },
}))

const defaultMembers = (): AcademyMember[] => [
  {
    id: 1,
    academy_id: 123,
    user_id: 'user-1',
    email: 'student@example.com',
    role: 'student',
    status: 'active',
    subscription_start_date: '2024-01-01',
    subscription_end_date: '2024-12-31',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    full_name: 'Student Example',
    has_alias_conflict: false,
    alias_conflict: null,
  },
  {
    id: 2,
    academy_id: 123,
    user_id: 'user-2',
    email: 'teacher@example.com',
    role: 'teacher',
    status: 'inactive',
    subscription_start_date: null,
    subscription_end_date: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    full_name: 'Teacher Inactive',
    has_alias_conflict: false,
    alias_conflict: null,
  },
  {
    id: 3,
    academy_id: 123,
    user_id: null,
    email: 'alias@example.com',
    role: 'student',
    status: 'awaiting_login',
    subscription_start_date: null,
    subscription_end_date: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    full_name: null,
    has_alias_conflict: true,
    alias_conflict: {
      email_login: 'alias+login@example.com',
      email_membership: 'alias@example.com',
      detected_at: '2024-01-02T00:00:00Z',
    },
  },
]

const pageTwoMembers: AcademyMember[] = [
  {
    id: 4,
    academy_id: 123,
    user_id: 'user-4',
    email: 'page-two@example.com',
    role: 'teacher',
    status: 'active',
    subscription_start_date: null,
    subscription_end_date: null,
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
    full_name: 'Teacher Page Two',
    has_alias_conflict: false,
    alias_conflict: null,
  },
]

const buildMembersResponse = (overrides?: Partial<{
  members: AcademyMember[]
  counts: { total: number; awaiting_login: number; active: number; inactive: number }
  pagination: { page: number; page_size: number; total_members: number; total_pages: number }
}>) => ({
  request_id: 'req-list',
  academy_id: 123,
  counts: overrides?.counts ?? { total: 4, awaiting_login: 1, active: 2, inactive: 1 },
  members: overrides?.members ?? defaultMembers(),
  pagination:
    overrides?.pagination ?? {
      page: 1,
      page_size: 25,
      total_members: 4,
      total_pages: 2,
    },
})

const resolveInvokeImplementation = () => {
  invokeMock.mockImplementation(async (name: string, options?: { body?: Record<string, unknown> }) => {
    if (name === 'admin-list-members') {
      const requestedPage = typeof options?.body?.page === 'number' ? options?.body?.page : 1
      if (requestedPage === 2) {
        return {
          data: buildMembersResponse({
            members: pageTwoMembers,
            pagination: { page: 2, page_size: 25, total_members: 4, total_pages: 2 },
          }),
          error: null,
        }
      }
      return { data: buildMembersResponse(), error: null }
    }
    if (name === 'admin-membership-status') {
      return {
        data: {
          request_id: 'req-status',
          membership_id: options?.body?.membership_id ?? 0,
          status: options?.body?.action === 'activate' ? 'active' : 'inactive',
          should_refresh_session: false,
        },
        error: null,
      }
    }
    if (name === 'admin-membership-role') {
      return {
        data: {
          request_id: 'req-role',
          cleaned_records: { student_profiles_archived: 1 },
          new_role: options?.body?.new_role ?? 'teacher',
          should_refresh_session: false,
        },
        error: null,
      }
    }
    if (name === 'admin-resolve-alias') {
      return {
        data: {
          request_id: 'req-alias',
          membership_id: options?.body?.membership_id ?? 0,
          email_normalized: typeof options?.body?.normalized_email === 'string' ? options?.body?.normalized_email : 'alias@example.com',
          metadata_payload: null,
          should_refresh_session: false,
        },
        error: null,
      }
    }
    if (name === 'invite-members') {
      return {
        data: {
          request_id: 'req-invite',
          emails_total: 1,
          emails_created: options?.body?.mode === 'create' ? 1 : 0,
          emails_resend: options?.body?.mode === 'resend' ? 1 : 0,
          emails_failed: 0,
        },
        error: null,
      }
    }
    return { data: {}, error: null }
  })
}

describe('MembersTab new admin actions', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    resolveInvokeImplementation()
    refreshProfileMock.mockReset()
    refreshSessionMock.mockReset()
    refreshSessionMock.mockResolvedValue({ data: {}, error: null })
  })

  it('renders members with status copy, subscription window, and action buttons', async () => {
    render(<MembersTab />)

    await screen.findByText('student@example.com')
    const activeRow = screen.getByText('student@example.com').closest('tr') as HTMLElement
    within(activeRow).getByText('Student Example')
    within(activeRow).getByText('Active')
    within(activeRow).getByText('Access granted')
    within(activeRow).getByText('Jan 01, 2024 → Dec 31, 2024')
    within(activeRow).getByRole('button', { name: /resend/i })

    const inactiveRow = screen.getByText('teacher@example.com').closest('tr') as HTMLElement
    within(inactiveRow).getByText('Access paused')
    within(inactiveRow).getByText('Membership inactive')
    within(inactiveRow).getByText('Reactivate to restore access.')
    within(inactiveRow).getByText('—', { selector: 'p' })
    within(inactiveRow).getByRole('button', { name: /resend/i })

    const awaitingRow = screen.getByText('alias@example.com').closest('tr') as HTMLElement
    within(awaitingRow).getByText('Awaiting login')
    within(awaitingRow).getByText('Invite pending')
    within(awaitingRow).getByText('—', { selector: 'p' })
    within(awaitingRow).getByRole('button', { name: /resend/i })

    expect(screen.getAllByRole('button', { name: /^activate$/i })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^deactivate$/i })).toHaveLength(1)
    screen.getByRole('button', { name: /convert to teacher/i })
    screen.getByRole('button', { name: /fix email/i })
  })

  it('requests paginated data from the Edge Function and loads the next page on demand', async () => {
    render(<MembersTab />)

    await screen.findByText('student@example.com')

    const listCalls = invokeMock.mock.calls.filter(([fn]) => fn === 'admin-list-members')
    expect(listCalls[0]?.[1]).toMatchObject({
      body: {
        academyId: 123,
        page: 1,
        pageSize: 25,
        role: null,
        status: null,
        search: null,
      },
    })

    const nextButton = screen.getByRole('link', { name: /next/i })
    fireEvent.click(nextButton)

    await screen.findByText('page-two@example.com')
    const paginationCalls = invokeMock.mock.calls.filter(([fn]) => fn === 'admin-list-members')
    expect(paginationCalls[1]?.[1]).toMatchObject({
      body: expect.objectContaining({ page: 2, pageSize: 25 }),
    })
  })

  it('applies filters/search and supports manual refresh requests', async () => {
    render(<MembersTab />)

    await screen.findByText('student@example.com')
    invokeMock.mockClear()

    const searchInput = screen.getByPlaceholderText(/search by name or email/i)
    fireEvent.change(searchInput, { target: { value: 'alias' } })

    const [roleSelect, statusSelect] = screen.getAllByRole('combobox')
    fireEvent.click(roleSelect)
    fireEvent.click(await screen.findByRole('option', { name: /teachers/i }))

    fireEvent.click(statusSelect)
    fireEvent.click(await screen.findByRole('option', { name: /access paused/i }))

    await waitFor(() => {
      const filterCalls = invokeMock.mock.calls.filter(([fn]) => fn === 'admin-list-members')
      const lastCall = filterCalls[filterCalls.length - 1]
      expect(lastCall?.[1]).toMatchObject({
        body: expect.objectContaining({ role: 'teacher', status: 'inactive', search: 'alias', page: 1 }),
      })
    })

    const refreshButton = screen.getByRole('button', { name: /^refresh$/i })
    invokeMock.mockClear()
    fireEvent.click(refreshButton)

    await waitFor(() => {
      const refreshCall = invokeMock.mock.calls.find(([fn]) => fn === 'admin-list-members')
      expect(refreshCall?.[1]).toMatchObject({
        body: expect.objectContaining({ role: 'teacher', status: 'inactive', search: 'alias' }),
      })
    })
  })

  it('prefills the resend dialog with the selected membership window and prevents date edits', async () => {
    render(<MembersTab />)

    const awaitingRow = await screen.findByText('alias@example.com')
    const awaitingRowActions = awaitingRow.closest('tr') as HTMLElement
    fireEvent.click(within(awaitingRowActions).getByRole('button', { name: /resend/i }))

    const dialog = await screen.findByRole('dialog')
    const emailInput = within(dialog).getByDisplayValue('alias@example.com') as HTMLInputElement
    expect(emailInput.value).toBe('alias@example.com')
    expect(emailInput.readOnly).toBe(true)
    expect(within(dialog).queryByLabelText(/subscription start/i)).toBeNull()
    expect(within(dialog).queryByLabelText(/subscription end/i)).toBeNull()
    within(dialog).getByText(/Existing subscription window/i)
  })

  it('triggers resend flow via dialog and calls invite-members with mode=resend', async () => {
    render(<MembersTab />)

    const awaitingRow = await screen.findByText('alias@example.com')
    const awaitingRowActions = awaitingRow.closest('tr') as HTMLElement
    fireEvent.click(within(awaitingRowActions).getByRole('button', { name: /resend/i }))

    const submit = await screen.findByRole('button', { name: /resend invite/i })
    fireEvent.click(submit)

    await waitFor(() => {
      const resendCall = invokeMock.mock.calls.find(([fn]) => fn === 'invite-members')
      expect(resendCall).toBeDefined()
      expect((resendCall?.[1] as { body: Record<string, unknown> }).body).toMatchObject({
        mode: 'resend',
        emails: ['alias@example.com'],
      })
    })
  })

  it('refreshes the table after creating invites without rendering a success banner', async () => {
    render(<MembersTab />)

    const inviteButton = await screen.findByRole('button', { name: /invite members/i })
    fireEvent.click(inviteButton)

    const emailsInput = await screen.findByLabelText(/email addresses/i)
    fireEvent.change(emailsInput, { target: { value: 'fresh-student@example.com' } })

    const submit = screen.getByRole('button', { name: /send invites/i })
    fireEvent.click(submit)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(screen.queryByText(/Invite processed/i)).toBeNull()

    await waitFor(() => {
      const listCalls = invokeMock.mock.calls.filter(([fn]) => fn === 'admin-list-members')
      expect(listCalls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('surfaces manual intervention copy when role conversion returns MANUAL_INTERVENTION_REQUIRED', async () => {
    invokeMock.mockImplementationOnce(async () => ({ data: buildMembersResponse(), error: null }))
    invokeMock.mockImplementationOnce(async () => ({
      data: null,
      error: {
        message: 'MANUAL_INTERVENTION_REQUIRED',
        context: {
          code: 'MANUAL_INTERVENTION_REQUIRED',
          request_id: 'req-manual',
          details: '{"instructions":["review membership","clean records"]}',
        },
      },
    }))
    render(<MembersTab />)

    const convertButton = await screen.findByRole('button', { name: /convert to teacher/i })
    fireEvent.click(convertButton)

    await screen.findByText(/Manual intervention required/i)
    screen.getByText(/review membership/i)
    screen.getByText(/clean records/i)
  })

  it('blocks deactivating the currently logged-in administrator membership', async () => {
    const defaultImpl = invokeMock.getMockImplementation() as
      | ((name: string, options?: { body?: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>)
      | undefined

    const selfAdmin: AcademyMember = {
      id: 50,
      academy_id: 123,
      user_id: 'admin-user',
      email: 'self-admin@example.com',
      role: 'academy_admin',
      status: 'active',
      subscription_start_date: '2025-01-05',
      subscription_end_date: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      full_name: 'Self Admin',
      has_alias_conflict: false,
      alias_conflict: null,
    }

    invokeMock.mockImplementation(async (name: string, options?: { body?: Record<string, unknown> }) => {
      if (name === 'admin-list-members') {
        return {
          data: buildMembersResponse({
            members: [selfAdmin, ...defaultMembers()],
            counts: { total: 4, awaiting_login: 1, active: 2, inactive: 1 },
          }),
          error: null,
        }
      }
      return defaultImpl ? defaultImpl(name, options) : { data: {}, error: null }
    })

    render(<MembersTab />)

    const selfRow = await screen.findByText('self-admin@example.com')
    const selfRowActions = selfRow.closest('tr') as HTMLElement
    expect(within(selfRowActions).queryByRole('button', { name: /^deactivate$/i })).toBeNull()

    const otherRow = screen.getByText('student@example.com').closest('tr') as HTMLElement
    within(otherRow).getByRole('button', { name: /^deactivate$/i })

    expect(invokeMock.mock.calls.filter(([fn]) => fn === 'admin-membership-status')).toHaveLength(0)
  })

  it('allows inviting academy admins from the dialog', async () => {
    render(<MembersTab />)

    const inviteButton = await screen.findByRole('button', { name: /invite members/i })
    fireEvent.click(inviteButton)

    const dialog = await screen.findByRole('dialog')
    const emailsInput = within(dialog).getByLabelText(/email addresses/i)
    fireEvent.change(emailsInput, { target: { value: 'admin-invite@example.com' } })

    const roleTrigger = within(dialog).getByRole('combobox', { name: /role/i })
    fireEvent.click(roleTrigger)
    const adminOption = await screen.findByRole('option', { name: /academy admin/i })
    fireEvent.click(adminOption)

    const submit = within(dialog).getByRole('button', { name: /send invites/i })
    fireEvent.click(submit)

    await waitFor(() => {
      const inviteCall = invokeMock.mock.calls.find(([fn]) => fn === 'invite-members')
      expect(inviteCall).toBeDefined()
      const options = inviteCall?.[1]
      const payload = isPlainRecord(options) && isPlainRecord(options.body) ? options.body : null
      if (!payload) {
        throw new Error('Expected invite payload')
      }
      expect(payload.mode).toBe('create')
      expect(payload.role).toBe('academy_admin')
      expect(payload.emails).toEqual(['admin-invite@example.com'])
    })
  })

  it('refreshes the admin profile when membership status changes require it', async () => {
    render(<MembersTab />)

    const activateButton = await screen.findByRole('button', { name: /^activate$/i })
    invokeMock.mockImplementationOnce(async (_name, options?: { body?: Record<string, unknown> }) => ({
      data: {
        request_id: 'req-status-refresh',
        membership_id: options?.body?.membership_id ?? 0,
        status: 'active',
        should_refresh_session: true,
      },
      error: null,
    }))

    fireEvent.click(activateButton)

    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1)
    })
  })

  it('refreshes the admin profile when role conversion requires it', async () => {
    render(<MembersTab />)

    const convertButton = await screen.findByRole('button', { name: /convert to teacher/i })
    invokeMock.mockImplementationOnce(async (_name, options?: { body?: Record<string, unknown> }) => ({
      data: {
        request_id: 'req-role-refresh',
        cleaned_records: { student_profiles_archived: 1 },
        new_role: options?.body?.new_role ?? 'teacher',
        should_refresh_session: true,
      },
      error: null,
    }))

    fireEvent.click(convertButton)

    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1)
    })
  })

  it('submits the alias resolution dialog and normalizes the email before invoking the Edge Function', async () => {
    render(<MembersTab />)

    const fixButtons = await screen.findAllByRole('button', { name: /fix email/i })
    fireEvent.click(fixButtons[0])

    const dialog = await screen.findByRole('dialog')
    within(dialog).getByText(/resolving the alias updates related academy memberships/i)
    const emailInput = within(dialog).getByLabelText(/correct email/i)
    fireEvent.change(emailInput, { target: { value: 'Alias+Login@Example.com  ' } })

    const saveButton = within(dialog).getByRole('button', { name: /^save$/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      const aliasCall = invokeMock.mock.calls.find(([fn]) => fn === 'admin-resolve-alias')
      expect(aliasCall).toBeDefined()
      expect((aliasCall?.[1] as { body: Record<string, unknown> }).body).toMatchObject({
        normalized_email: 'alias+login@example.com',
      })
    })
  })

  it('refreshes the admin profile when alias resolution requires a session sync', async () => {
    const defaultImpl = invokeMock.getMockImplementation() as
      | ((name: string, options?: { body?: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>)
      | undefined

    invokeMock.mockImplementation(async (name: string, options?: { body?: Record<string, unknown> }) => {
      if (name === 'admin-resolve-alias') {
        return {
          data: {
            request_id: 'req-alias-refresh',
            membership_id: options?.body?.membership_id ?? 0,
            email_normalized: 'alias+login@example.com',
            metadata_payload: { app_metadata: { memberships: [] } },
            should_refresh_session: true,
          },
          error: null,
        }
      }
      return defaultImpl ? defaultImpl(name, options) : { data: {}, error: null }
    })

    render(<MembersTab />)

    const fixButtons = await screen.findAllByRole('button', { name: /fix email/i })
    fireEvent.click(fixButtons[0])

    const dialog = await screen.findByRole('dialog')
    const saveButton = within(dialog).getByRole('button', { name: /^save$/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1)
    })
  })

  it('opens the alias dialog automatically when an admin action raises MEMBERSHIP_OWNERSHIP_CONFLICT', async () => {
    const defaultImpl = invokeMock.getMockImplementation() as
      | ((name: string, options?: { body?: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>)
      | undefined

    invokeMock.mockImplementation(async (name: string, options?: { body?: Record<string, unknown> }) => {
      if (name === 'admin-list-members') {
        const response = buildMembersResponse()
        response.members[0].has_alias_conflict = true
        response.members[0].alias_conflict = {
          email_login: 'student+alias@example.com',
          email_membership: 'student@example.com',
          detected_at: '2024-02-01T00:00:00Z',
        }
        return { data: response, error: null }
      }
      if (name === 'admin-membership-status') {
        return {
          data: null,
          error: {
            message: 'MEMBERSHIP_OWNERSHIP_CONFLICT',
            context: {
              code: 'MEMBERSHIP_OWNERSHIP_CONFLICT',
              request_id: 'req-conflict',
            },
          },
        }
      }
      return defaultImpl ? defaultImpl(name, options) : { data: {}, error: null }
    })

    render(<MembersTab />)

    const deactivateButton = await screen.findByRole('button', { name: /^deactivate$/i })
    fireEvent.click(deactivateButton)

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      const emailInput = within(dialog).getByLabelText(/correct email/i) as HTMLInputElement
      expect(emailInput.value).toBe('student+alias@example.com')
    })
    expect(dialog.textContent ?? '').toContain('Login email detected: student+alias@example.com')
    expect(dialog.textContent ?? '').toContain('Stored membership email: student@example.com')
  })
})
