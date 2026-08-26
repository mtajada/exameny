import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import { format } from 'date-fns'

import { useAuth } from '@/contexts/useAuth'
import type { MembershipRole, MembershipStatus } from '@/contexts/AuthContextBase'
import { supabase } from '@/integrations/supabase/client'
import { EdgeFunctionErrorPayload, normalizeEdgeFunctionError } from '@/lib/auth/edge'
import { mapInviteAdminErrorToCopy } from '@/lib/auth/errorCopy'
import { refreshSessionSafely } from '@/lib/auth/refreshSessionSafely'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'

import { InviteMembersDialog, InviteDialogMode, InviteMembersResponse } from './InviteMembersDialog'
import BulkImportDialog from './BulkImportDialog'

type MembersCount = {
  total: number
  awaiting_login: number
  active: number
  inactive: number
}

interface AliasConflictInfo {
  email_login: string
  email_membership: string
  detected_at: string
}

export interface AcademyMember {
  id: number
  academy_id: number
  user_id: string | null
  email: string
  role: MembershipRole
  status: MembershipStatus
  subscription_start_date: string | null
  subscription_end_date: string | null
  created_at: string
  updated_at: string
  full_name: string | null
  has_alias_conflict: boolean
  alias_conflict: AliasConflictInfo | null
}

interface MembersResponse {
  request_id: string
  academy_id: number
  counts: MembersCount
  members: AcademyMember[]
  pagination?: {
    page: number
    page_size: number
    total_members: number
    total_pages: number
  } | null
}

interface AliasDialogState {
  open: boolean
  member: AcademyMember | null
  email: string
  loginEmail: string | null
  membershipEmail: string | null
  detectedAt: string | null
  reason: string
}

interface AliasResolutionResponse {
  request_id: string
  membership_id: number
  email_normalized: string
  metadata_payload: Record<string, unknown> | null
  should_refresh_session: boolean
}

interface ManualInterventionState {
  requestId: string
  instructions: string[]
  details?: unknown
}

interface ActionFeedback {
  type: 'success' | 'error'
  title: string
  description: string
  requestId?: string | null
}

interface PaginationState {
  pageSize: number
  totalMembers: number
  totalPages: number
}

const DEFAULT_COUNTS: MembersCount = { total: 0, awaiting_login: 0, active: 0, inactive: 0 }
const DATE_DISPLAY = 'MMM dd, yyyy'
const FEEDBACK_AUTO_DISMISS_MS = 4000
const STATUS_META: Record<MembershipStatus, { label: string; description: string; badge: 'default' | 'secondary' | 'outline' }> = {
  awaiting_login: { label: 'Awaiting login', description: 'Invite pending', badge: 'secondary' },
  active: { label: 'Active', description: 'Access granted', badge: 'default' },
  inactive: { label: 'Access paused', description: 'Membership inactive', badge: 'outline' },
}

const ROLE_LABEL: Record<MembershipRole, string> = {
  student: 'Student',
  teacher: 'Teacher',
  academy_admin: 'Academy admin',
}

const MANUAL_INTERVENTION_FALLBACK = [
  'Review the membership that triggered the error.',
  'Clean dependent records (classes, student profiles, assignments).',
  'Ask the affected user to sign in again once records are ready.',
]
const PAGE_SIZE = 25
const DEFAULT_PAGINATION: PaginationState = {
  pageSize: PAGE_SIZE,
  totalMembers: 0,
  totalPages: 1,
}

const buildRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

const formatDateOrDash = (value: string | null): string => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return format(parsed, DATE_DISPLAY)
}

const formatWindow = (start: string | null, end: string | null) => {
  if (!start && !end) return '—'
  if (start && !end) return `From ${formatDateOrDash(start)}`
  if (!start && end) return `Until ${formatDateOrDash(end)}`
  return `${formatDateOrDash(start)} → ${formatDateOrDash(end)}`
}

const STATUS_FILTERS: Array<{ value: 'all' | MembershipStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'awaiting_login', label: 'Awaiting login' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Access paused' },
]

const ROLE_FILTERS: Array<{ value: 'all' | MembershipRole; label: string }> = [
  { value: 'all', label: 'All roles' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'academy_admin', label: 'Admins' },
]

const REQUEST_ID_HEADER = 'x-request-id'

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseManualInstructions = (details: unknown): string[] => {
  if (!details) {
    return []
  }
  if (Array.isArray(details)) {
    return details.map((entry) => String(entry))
  }
  if (isPlainRecord(details)) {
    if (Array.isArray(details.instructions)) {
      return details.instructions.map((entry) => String(entry))
    }
  }
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details)
      return parseManualInstructions(parsed)
    } catch {
      return []
    }
  }
  return []
}

const extractAliasDetails = (details: unknown): Partial<AliasConflictInfo> | null => {
  if (!isPlainRecord(details)) {
    return null
  }

  const alias = details.alias_conflict
  if (!isPlainRecord(alias)) {
    return null
  }

  const payload = alias
  const emailLogin = typeof payload.email_login === 'string' && payload.email_login.length > 0 ? payload.email_login : null
  const emailMembership =
    typeof payload.email_membership === 'string' && payload.email_membership.length > 0 ? payload.email_membership : null
  const detectedAt = typeof payload.detected_at === 'string' && payload.detected_at.length > 0 ? payload.detected_at : null

  if (!emailLogin && !emailMembership && !detectedAt) {
    return null
  }

  const result: Partial<AliasConflictInfo> = {}
  if (emailLogin) {
    result.email_login = emailLogin
  }
  if (emailMembership) {
    result.email_membership = emailMembership
  }
  if (detectedAt) {
    result.detected_at = detectedAt
  }
  return result
}

const MembersTab = () => {
  const { activeAcademyId, user } = useAuth()

  const [members, setMembers] = useState<AcademyMember[]>([])
  const [counts, setCounts] = useState<MembersCount>(DEFAULT_COUNTS)
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | MembershipRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | MembershipStatus>('all')
  const [page, setPage] = useState(1)
  const [paginationState, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION)
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null)
  const [manualIntervention, setManualIntervention] = useState<ManualInterventionState | null>(null)
  const [aliasDialog, setAliasDialog] = useState<AliasDialogState>({
    open: false,
    member: null,
    email: '',
    loginEmail: null,
    membershipEmail: null,
    detectedAt: null,
    reason: '',
  })
  const [inviteDialog, setInviteDialog] = useState<{ mode: InviteDialogMode; membership?: AcademyMember } | null>(null)
  const [isBulkOpen, setIsBulkOpen] = useState(false)
  const [pendingMembershipId, setPendingMembershipId] = useState<number | null>(null)
  const [cleanedRecords, setCleanedRecords] = useState<{ requestId: string; payload: Record<string, unknown> } | null>(null)
  const normalizedSearch = search.trim()

  const membershipByEmail = useMemo(() => {
    const entries = members.map<[string, AcademyMember]>((member) => [member.email.toLowerCase(), member])
    return new Map<string, AcademyMember>(entries)
  }, [members])

  const membershipById = useMemo(() => {
    const entries = members.map<[number, AcademyMember]>((member) => [member.id, member])
    return new Map<number, AcademyMember>(entries)
  }, [members])

  const totalPages = Math.max(1, paginationState.totalPages)
  const currentPage = page > totalPages ? totalPages : page
  const hasVisibleMembers = paginationState.totalMembers > 0
  const firstItemIndex = hasVisibleMembers ? (currentPage - 1) * paginationState.pageSize + 1 : 0
  const lastItemIndex = hasVisibleMembers ? Math.min(firstItemIndex + members.length - 1, paginationState.totalMembers) : 0
  const disablePrevious = currentPage <= 1
  const disableNext = currentPage >= totalPages || !hasVisibleMembers
  const pageSummary = hasVisibleMembers
    ? `Showing ${firstItemIndex}–${lastItemIndex} of ${paginationState.totalMembers}`
    : 'No members to display'
  const showSubscriptionWindow = useMemo(() => {
    if (roleFilter === 'student') return true
    if (roleFilter !== 'all') return false
    return members.some((member) => member.role === 'student')
  }, [members, roleFilter])

  const goToPage = (targetPage: number) => {
    if (targetPage < 1 || targetPage > totalPages || targetPage === page) {
      return
    }
    setPage(targetPage)
  }

  const resolveExistingMembership = useCallback(
    ({ email, membershipId }: { email?: string; membershipId?: number }) => {
      if (typeof membershipId === 'number' && membershipById.has(membershipId)) {
        const record = membershipById.get(membershipId)!
        return {
          email: record.email,
          role: record.role,
          status: record.status,
          subscription_start_date: record.subscription_start_date,
          subscription_end_date: record.subscription_end_date,
        }
      }
      if (email) {
        const record = membershipByEmail.get(email.toLowerCase())
        if (record) {
          return {
            email: record.email,
            role: record.role,
            status: record.status,
            subscription_start_date: record.subscription_start_date,
            subscription_end_date: record.subscription_end_date,
          }
        }
      }
      return null
    },
    [membershipByEmail, membershipById],
  )

  const fetchMembers = useCallback(async () => {
    if (!activeAcademyId) {
      setMembers([])
      setCounts(DEFAULT_COUNTS)
      setPagination({ ...DEFAULT_PAGINATION })
      setIsLoading(false)
      setListError('Select an active academy to manage members.')
      if (page !== 1) {
        setPage(1)
      }
      return
    }

    setIsLoading(true)
    setListError(null)

    const requestId = buildRequestId()
    const role = roleFilter === 'all' ? null : roleFilter
    const status = statusFilter === 'all' ? null : statusFilter
    const searchTerm = normalizedSearch.length > 0 ? normalizedSearch : null

    try {
      const { data, error } = await supabase.functions.invoke<MembersResponse>('admin-list-members', {
        body: {
          academyId: activeAcademyId,
          role,
          status,
          search: searchTerm,
          page,
          pageSize: PAGE_SIZE,
        },
        headers: { [REQUEST_ID_HEADER]: requestId },
      })

      if (error) {
        const parsed = normalizeEdgeFunctionError(error)
        setListError(parsed.message)
        setMembers([])
        setCounts(DEFAULT_COUNTS)
        setPagination({ ...DEFAULT_PAGINATION })
        return
      }

      setMembers(data?.members ?? [])
      setCounts(data?.counts ?? DEFAULT_COUNTS)

      const paginationPayload = data?.pagination ?? null
      const resolvedPageSize =
        paginationPayload && typeof paginationPayload.page_size === 'number' && paginationPayload.page_size > 0
          ? paginationPayload.page_size
          : PAGE_SIZE
      const resolvedTotalMembers =
        paginationPayload && typeof paginationPayload.total_members === 'number'
          ? paginationPayload.total_members
          : data?.members?.length ?? 0
      const resolvedTotalPages =
        paginationPayload && typeof paginationPayload.total_pages === 'number' && paginationPayload.total_pages > 0
          ? paginationPayload.total_pages
          : Math.max(1, Math.ceil((resolvedTotalMembers || 0) / resolvedPageSize))

      setPagination({
        pageSize: resolvedPageSize,
        totalMembers: resolvedTotalMembers,
        totalPages: resolvedTotalPages,
      })

      if (resolvedTotalPages > 0 && page > resolvedTotalPages) {
        setPage(resolvedTotalPages)
      }
    } catch (err) {
      console.error('[MembersTab] admin-list-members failed')
      setListError('Unable to load the member list.')
      setMembers([])
      setCounts(DEFAULT_COUNTS)
      setPagination({ ...DEFAULT_PAGINATION })
    } finally {
      setIsLoading(false)
    }
  }, [activeAcademyId, normalizedSearch, page, roleFilter, statusFilter])

  useEffect(() => {
    void fetchMembers()
  }, [fetchMembers])

  useEffect(() => {
    setPage(1)
  }, [activeAcademyId])

  useEffect(() => {
    if (!feedback) {
      return
    }

    const timeout = window.setTimeout(() => {
      setFeedback(null)
    }, FEEDBACK_AUTO_DISMISS_MS)

    return () => window.clearTimeout(timeout)
  }, [feedback])

  const openInviteDialog = (config: { mode: InviteDialogMode; membership?: AcademyMember }) => {
    setFeedback(null)
    setInviteDialog(config)
  }

  const closeInviteDialog = () => setInviteDialog(null)

  const resetAliasDialog = useCallback(() => {
    setAliasDialog({
      open: false,
      member: null,
      email: '',
      loginEmail: null,
      membershipEmail: null,
      detectedAt: null,
      reason: '',
    })
  }, [])

  const handleActionError = useCallback(
    (
      payload: EdgeFunctionErrorPayload,
      context?: { membership?: AcademyMember },
      options?: { overrideMessage?: string },
    ) => {
      if (payload.code === 'MANUAL_INTERVENTION_REQUIRED') {
        const instructions = parseManualInstructions(payload.details) ?? []
        setManualIntervention({
          requestId: payload.requestId ?? 'unknown',
          instructions: instructions.length > 0 ? instructions : MANUAL_INTERVENTION_FALLBACK,
          details: payload.details,
        })
      }

      if (payload.code === 'MEMBERSHIP_OWNERSHIP_CONFLICT' && context?.membership) {
        const payloadDetails = extractAliasDetails(payload.details)
        const memberDetails = context.membership.alias_conflict
        const loginEmail = payloadDetails?.email_login || memberDetails?.email_login || null
        const membershipEmail =
          payloadDetails?.email_membership || memberDetails?.email_membership || context.membership.email || null
        const detectedAt = payloadDetails?.detected_at || memberDetails?.detected_at || null
        const suggestedEmail = loginEmail ?? membershipEmail ?? context.membership.email

        setAliasDialog({
          open: true,
          member: context.membership,
          email: suggestedEmail,
          loginEmail,
          membershipEmail,
          detectedAt,
          reason: 'Ownership conflict detected during admin action.',
        })
      }

      setFeedback({
        type: 'error',
        title: 'Action failed',
        description: options?.overrideMessage ?? payload.message,
        requestId: payload.requestId,
      })
    },
    [],
  )

  const handleStatusChange = useCallback(
    async (member: AcademyMember, action: 'activate' | 'deactivate') => {
      if (!activeAcademyId) {
        setFeedback({
          type: 'error',
          title: 'Select an academy',
          description: 'Choose an active academy before changing statuses.',
        })
        return
      }

      if (action === 'deactivate' && member.user_id && user?.id === member.user_id) {
        setFeedback({
          type: 'error',
          title: 'Not allowed',
          description: 'You cannot deactivate your own administrator membership.',
        })
        return
      }

      setPendingMembershipId(member.id)
      const requestId = buildRequestId()

      try {
        const { data, error } = await supabase.functions.invoke('admin-membership-status', {
          body: { membership_id: member.id, action },
          headers: { [REQUEST_ID_HEADER]: requestId },
        })
        if (error) {
          handleActionError(normalizeEdgeFunctionError(error), { membership: member })
          return
        }

        const response = data as
          | {
              request_id: string
              membership_id: number
              status: MembershipStatus
              should_refresh_session: boolean
            }
          | null

        setFeedback({
          type: 'success',
          title: action === 'activate' ? 'Member reactivated' : 'Member deactivated',
          description: `${member.email} is now ${response?.status ?? action}.`,
          requestId: response?.request_id,
        })

        if (response?.should_refresh_session) {
          await refreshSessionSafely({ context: 'MembersTab/membership-status' })
        }

        await fetchMembers()
      } finally {
        setPendingMembershipId(null)
      }
    },
    [activeAcademyId, fetchMembers, handleActionError, user?.id],
  )

  const handleRoleConversion = useCallback(
    async (member: AcademyMember, targetRole: MembershipRole) => {
      if (!activeAcademyId) {
        setFeedback({
          type: 'error',
          title: 'Select an academy',
          description: 'Choose an active academy before converting roles.',
        })
        return
      }

      setPendingMembershipId(member.id)
      const requestId = buildRequestId()

      try {
        const { data, error } = await supabase.functions.invoke('admin-membership-role', {
          body: { membership_id: member.id, new_role: targetRole },
          headers: { [REQUEST_ID_HEADER]: requestId },
        })

        if (error) {
          handleActionError(normalizeEdgeFunctionError(error), { membership: member })
          return
        }

        const response = data as
          | {
              request_id: string
              cleaned_records?: Record<string, unknown>
              new_role: MembershipRole
              should_refresh_session: boolean
            }
          | null

        if (response?.cleaned_records) {
          setCleanedRecords({
            requestId: response.request_id,
            payload: response.cleaned_records,
          })
        }

        setFeedback({
          type: 'success',
          title: 'Role updated',
          description: `${member.email} is now ${ROLE_LABEL[targetRole]}.`,
          requestId: response?.request_id,
        })

        if (response?.should_refresh_session) {
          await refreshSessionSafely({ context: 'MembersTab/membership-role' })
        }

        await fetchMembers()
      } finally {
        setPendingMembershipId(null)
      }
    },
    [activeAcademyId, fetchMembers, handleActionError],
  )

  const handleAliasSubmit = useCallback(async () => {
    if (!aliasDialog.member) {
      return
    }

    const normalizedEmail = aliasDialog.email.trim().toLowerCase()
    if (!normalizedEmail.includes('@')) {
      setFeedback({
        type: 'error',
        title: 'Invalid email',
        description: 'Enter a valid email before saving.',
      })
      return
    }

    const requestId = buildRequestId()
    setPendingMembershipId(aliasDialog.member.id)

    try {
      const { data, error } = await supabase.functions.invoke<AliasResolutionResponse>('admin-resolve-alias', {
        body: {
          membership_id: aliasDialog.member.id,
          normalized_email: normalizedEmail,
          reason: aliasDialog.reason || null,
        },
        headers: { [REQUEST_ID_HEADER]: requestId },
      })

      if (error) {
        handleActionError(normalizeEdgeFunctionError(error), { membership: aliasDialog.member })
        return
      }

      const responsePayload = data ?? null
      const responseRequestId = responsePayload?.request_id ?? requestId

      setFeedback({
        type: 'success',
        title: 'Alias resolved',
        description: `Updated email for ${aliasDialog.member.email}.`,
        requestId: responseRequestId,
      })
      resetAliasDialog()

      if (responsePayload?.should_refresh_session) {
        await refreshSessionSafely({ context: 'MembersTab/resolve-alias' })
      }

      await fetchMembers()
    } finally {
      setPendingMembershipId(null)
    }
  }, [aliasDialog, fetchMembers, handleActionError, resetAliasDialog])

  const canConvertRole = (member: AcademyMember) => {
    if (member.role === 'academy_admin') return false
    if (member.status === 'awaiting_login') return false
    return true
  }

  const conversionTarget = (member: AcademyMember): MembershipRole | null => {
    if (member.role === 'student') return 'teacher'
    if (member.role === 'teacher') return 'student'
    return null
  }

  const handleInviteCompleted = async (result: InviteMembersResponse) => {
    const hasFailures = result.emails_failed > 0

    if (hasFailures) {
      setFeedback({
        type: 'error',
        title: 'Recent email',
        description: `We could not deliver ${result.emails_failed} of ${result.emails_total} invite email${
          result.emails_total === 1 ? '' : 's'
        }. Review the failure details and try again.`,
        requestId: result.request_id,
      })
    } else {
      closeInviteDialog()
    }
    await fetchMembers()
  }

  const handleInviteError = (error: EdgeFunctionErrorPayload) => {
    handleActionError(error, undefined, { overrideMessage: mapInviteAdminErrorToCopy(error) })
  }

  const renderStatusBadge = (member: AcademyMember) => {
    const meta = STATUS_META[member.status]
    return (
      <div>
        <Badge variant={meta.badge}>{meta.label}</Badge>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
        {member.status === 'inactive' && (
          <p className="text-xs text-muted-foreground">Reactivate to restore access.</p>
        )}
      </div>
    )
  }

  if (listError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Members unavailable</AlertTitle>
        <AlertDescription>{listError}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Member management</h2>
          <p className="text-sm text-muted-foreground">
            Active {counts.active} · Awaiting {counts.awaiting_login} · Access paused {counts.inactive}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchMembers()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsBulkOpen(true)}>
            Import CSV
          </Button>
          <Button size="sm" onClick={() => openInviteDialog({ mode: 'create' })}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite members
          </Button>
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'}>
          <AlertTitle>{feedback.title}</AlertTitle>
          <AlertDescription>
            {feedback.description}
            {feedback.requestId && (
              <span className="ml-2 text-xs text-muted-foreground">Request {feedback.requestId}</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {manualIntervention && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Manual intervention required</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p className="text-sm">Request ID: {manualIntervention.requestId}</p>
              <ul className="list-disc pl-4 text-sm space-y-1">
                {manualIntervention.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {cleanedRecords && (
        <Alert>
          <AlertTitle>Cleaned records</AlertTitle>
          <AlertDescription>
            <p className="text-sm mb-1">Request {cleanedRecords.requestId}</p>
            <ul className="list-disc pl-4 text-sm space-y-1">
              {Object.entries(cleanedRecords.payload).map(([key, value]) => (
                <li key={key}>
                  <strong>{key}:</strong> {String(value)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name or email"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </div>
            <Select
              value={roleFilter}
              onValueChange={(value) => {
                setRoleFilter(value as 'all' | MembershipRole)
                setPage(1)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_FILTERS.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as 'all' | MembershipStatus)
                setPage(1)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members ({paginationState.totalMembers})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading members…</p>
          ) : (
	            <>
	              <Table>
	              <TableHeader>
	                <TableRow>
	                  <TableHead>Member</TableHead>
	                  <TableHead>Role</TableHead>
	                  <TableHead>Status</TableHead>
	                  {showSubscriptionWindow && <TableHead>Subscription window</TableHead>}
	                  <TableHead className="text-right">Actions</TableHead>
	                </TableRow>
	              </TableHeader>
	              <TableBody>
	                {members.length === 0 && (
	                  <TableRow>
	                    <TableCell colSpan={showSubscriptionWindow ? 5 : 4} className="text-center text-muted-foreground">
	                      No members match the current filters.
	                    </TableCell>
	                  </TableRow>
	                )}
		                {members.map((member) => {
		                  const targetRole = conversionTarget(member)
		                  const actionDisabled = pendingMembershipId === member.id
		                  const canResend = true
		                  const canActivate = member.status === 'inactive'
		                  const canDeactivate = member.status === 'active' && member.user_id !== user?.id
		                  const canConvert = Boolean(targetRole && canConvertRole(member))
		                  const canFixEmail = member.has_alias_conflict
		                  const subscriptionWindowValue =
		                    member.role === 'student'
		                      ? formatWindow(member.subscription_start_date, member.subscription_end_date)
		                      : '—'
	                  return (
	                    <TableRow key={member.id}>
	                      <TableCell>
	                        <div className="font-medium flex items-center gap-2">
	                          {member.full_name ?? '—'}
                          {member.has_alias_conflict && (
                            <Badge variant="destructive" className="gap-1">
                              <ShieldAlert className="h-3 w-3" />
                              Alias conflict
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">{member.email}</div>
                        {member.has_alias_conflict && member.alias_conflict && (
                          <p className="text-xs text-muted-foreground">
                            Detected on {formatDateOrDash(member.alias_conflict.detected_at)} — login email{' '}
                            {member.alias_conflict.email_login}
                          </p>
                        )}
	                      </TableCell>
	                      <TableCell>
	                        <Badge variant={member.role === 'academy_admin' ? 'destructive' : 'secondary'}>
	                          {ROLE_LABEL[member.role]}
	                        </Badge>
	                      </TableCell>
	                      <TableCell>{renderStatusBadge(member)}</TableCell>
	                      {showSubscriptionWindow && (
	                        <TableCell>
	                          <p className={subscriptionWindowValue === '—' ? 'text-sm text-muted-foreground' : 'text-sm'}>
	                            {subscriptionWindowValue}
	                          </p>
	                        </TableCell>
		                      )}
		                      <TableCell>
		                        <div className="flex flex-wrap justify-end gap-2">
		                          {canResend && (
		                              <Button
		                                variant="outline"
		                                size="sm"
		                                onClick={() => openInviteDialog({ mode: 'resend', membership: member })}
		                              >
		                                <Mail className="mr-1 h-4 w-4" />
		                                Resend invite
		                              </Button>
		                            )}
		                            {canActivate && (
		                            <Button
		                              variant="outline"
		                              size="sm"
		                              disabled={actionDisabled}
		                              onClick={() => handleStatusChange(member, 'activate')}
		                            >
		                              <CheckCircle2 className="mr-1 h-4 w-4" />
		                              Activate
		                            </Button>
		                          )}
		                            {canDeactivate && (
		                            <Button
		                              variant="outline"
		                              size="sm"
		                              disabled={actionDisabled}
		                              onClick={() => handleStatusChange(member, 'deactivate')}
		                            >
		                              <UserMinus className="mr-1 h-4 w-4" />
		                              Deactivate
		                            </Button>
		                          )}
		                            {canConvert && targetRole && (
		                            <Button
		                              variant="outline"
		                              size="sm"
		                              disabled={actionDisabled}
		                              onClick={() => handleRoleConversion(member, targetRole)}
		                            >
		                              <ArrowLeftRight className="mr-1 h-4 w-4" />
		                              Convert to {ROLE_LABEL[targetRole]}
		                            </Button>
		                          )}
		                            {canFixEmail && (
		                            <Button
		                              variant="outline"
		                              size="sm"
		                              disabled={actionDisabled}
		                              onClick={() =>
		                                setAliasDialog({
		                                  open: true,
		                                  member,
		                                  email:
		                                    member.alias_conflict?.email_login ??
		                                    member.alias_conflict?.email_membership ??
		                                    member.email,
		                                  loginEmail: member.alias_conflict?.email_login ?? null,
		                                  membershipEmail: member.alias_conflict?.email_membership ?? member.email,
		                                  detectedAt: member.alias_conflict?.detected_at ?? null,
		                                  reason: '',
		                                })
		                              }
		                            >
		                              <ShieldAlert className="mr-1 h-4 w-4" />
		                              Fix email
		                            </Button>
		                          )}
		                        </div>
		                      </TableCell>
		                    </TableRow>
		                  )
		                })}
	              </TableBody>
            </Table>
            <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
              <span>{pageSummary}</span>
              <Pagination className="md:justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={disablePrevious}
                      className={disablePrevious ? 'pointer-events-none opacity-50' : undefined}
                      onClick={(event) => {
                        event.preventDefault()
                        if (!disablePrevious) {
                          goToPage(currentPage - 1)
                        }
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-3 py-2 text-sm font-medium">
                      Page {hasVisibleMembers ? currentPage : 0} of {hasVisibleMembers ? totalPages : 0}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={disableNext}
                      className={disableNext ? 'pointer-events-none opacity-50' : undefined}
                      onClick={(event) => {
                        event.preventDefault()
                        if (!disableNext) {
                          goToPage(currentPage + 1)
                        }
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <InviteMembersDialog
        open={Boolean(inviteDialog)}
        mode={inviteDialog?.mode ?? 'create'}
        activeAcademyId={activeAcademyId}
        membershipContext={inviteDialog?.membership ?? null}
        onOpenChange={(open) => {
          if (!open) {
            closeInviteDialog()
          }
        }}
        onCompleted={handleInviteCompleted}
        onError={handleInviteError}
        resolveExistingMembership={resolveExistingMembership}
        onOpenBulkImport={() => setIsBulkOpen(true)}
      />

      <BulkImportDialog
        open={isBulkOpen}
        onOpenChange={setIsBulkOpen}
        onCompleted={async () => {
          setIsBulkOpen(false)
          await fetchMembers()
        }}
      />

      <Dialog
        open={aliasDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            resetAliasDialog()
          } else {
            setAliasDialog((prev) => ({ ...prev, open }))
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve alias conflict</DialogTitle>
            <DialogDescription>
              Confirm the member&apos;s login email matches Supabase Auth before saving. Resolving the alias updates related
              academy memberships, records the resolution in protected operational storage, and requires the user to
              sign in again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(aliasDialog.loginEmail || aliasDialog.membershipEmail) && (
              <div className="rounded-md border border-dashed p-3 text-sm">
                {aliasDialog.loginEmail && (
                  <p>
                    <span className="font-semibold">Login email detected:</span> {aliasDialog.loginEmail}
                  </p>
                )}
                {aliasDialog.membershipEmail && (
                  <p className="text-muted-foreground">
                    <span className="font-medium">Stored membership email:</span> {aliasDialog.membershipEmail}
                  </p>
                )}
                {aliasDialog.detectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Incident detected at {formatDateOrDash(aliasDialog.detectedAt)}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="alias-email">Correct email</Label>
              <Input
                id="alias-email"
                value={aliasDialog.email}
                onChange={(event) => setAliasDialog((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alias-reason">Reason (optional)</Label>
              <Input
                id="alias-reason"
                value={aliasDialog.reason}
                onChange={(event) => setAliasDialog((prev) => ({ ...prev, reason: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAliasDialog}>
              Cancel
            </Button>
            <Button onClick={handleAliasSubmit} disabled={!aliasDialog.member || pendingMembershipId === aliasDialog.member.id}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MembersTab
