import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays, FileUp, MailPlus, Upload } from 'lucide-react'

import type { MembershipRole, MembershipStatus } from '@/contexts/AuthContextBase'
import { supabase } from '@/integrations/supabase/client'
import {
  EdgeFunctionErrorPayload,
  normalizeEdgeFunctionError,
} from '@/lib/auth/edge'
import { mapInviteAdminErrorToCopy } from '@/lib/auth/errorCopy'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { formatAuthMethodList, resolveAuthMethodFlags } from '@/lib/auth/authFlags'

export type InviteDialogMode = 'create' | 'resend'

export interface InviteMembersResponse {
  request_id: string
  emails_total: number
  emails_created: number
  emails_resend: number
  emails_failed: number
  failures?: Array<{ email: string; reason: string }>
}

export interface InviteeMembershipSummary {
  id: number
  email: string
  role: MembershipRole
  status: MembershipStatus
  subscription_start_date: string | null
  subscription_end_date: string | null
}

interface ExistingMembershipDetails {
  email: string
  role: MembershipRole
  status: MembershipStatus
  subscription_start_date: string | null
  subscription_end_date: string | null
}

interface InviteMembersDialogProps {
  open: boolean
  mode: InviteDialogMode
  activeAcademyId: number | null
  defaultEmails?: string[]
  defaultRole?: MembershipRole
  membershipContext?: InviteeMembershipSummary | null
  onOpenChange: (open: boolean) => void
  onCompleted: (payload: InviteMembersResponse) => void
  onError: (error: EdgeFunctionErrorPayload) => void
  resolveExistingMembership: (input: { email?: string; membershipId?: number }) => ExistingMembershipDetails | null
  onOpenBulkImport?: () => void
}

type SubscriptionWindow = {
  startDate: string | null
  endDate: string | null
}

const MEMBERSHIP_ROLES: MembershipRole[] = ['student', 'teacher', 'academy_admin']
const MEMBERSHIP_STATUSES: MembershipStatus[] = ['awaiting_login', 'active', 'inactive']

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isMembershipRole = (value: unknown): value is MembershipRole =>
  typeof value === 'string' && MEMBERSHIP_ROLES.includes(value as MembershipRole)

const isMembershipStatus = (value: unknown): value is MembershipStatus =>
  typeof value === 'string' && MEMBERSHIP_STATUSES.includes(value as MembershipStatus)

const buildExistingDetailsFromPayload = (
  details: unknown,
  fallbackEmail?: string,
): ExistingMembershipDetails | null => {
  if (!isPlainRecord(details)) {
    return null
  }

  const record = details
  const email = typeof record.email === 'string' ? record.email : fallbackEmail
  const roleValue = record.role
  const statusValue = record.status
  const role = isMembershipRole(roleValue) ? roleValue : null
  const status = isMembershipStatus(statusValue) ? statusValue : null
  const subscription_start_date =
    typeof record.subscription_start_date === 'string' ? record.subscription_start_date : null
  const subscription_end_date =
    typeof record.subscription_end_date === 'string' ? record.subscription_end_date : null

  if (!email || !role || !status) {
    return null
  }

  return {
    email,
    role,
    status,
    subscription_start_date,
    subscription_end_date,
  }
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DATE_FORMAT = 'PPP'
const DEFAULT_STUDENT_ROLE: MembershipRole = 'student'
const REQUEST_ID_HEADER = 'x-request-id'
const AUTH_METHOD_LIST = formatAuthMethodList(resolveAuthMethodFlags())

const inviteDialogCopy = {
  headings: {
    create: 'Invite members',
    resend: 'Resend invitation',
  },
  errors: {
    missingAcademy: 'Select an active academy before inviting members.',
    missingEmails: 'Add at least one valid email.',
    endRequiresStart: 'Subscription end date requires a start date.',
    invalidRange: 'Subscription start date must be before the end date.',
  },
  duplicateNotice: {
    title: 'Invitation already exists',
    guidance: 'Use the Resend action to re-issue the email without creating a duplicate membership.',
  },
} as const

const STATUS_LABEL: Record<MembershipStatus, string> = {
  awaiting_login: 'Awaiting login',
  active: 'Active',
  inactive: 'Access paused',
}

const formatDateDisplay = (value: string | null): string => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return format(parsed, DATE_FORMAT)
}

const parseEmailList = (value: string): string[] =>
  value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0 && EMAIL_PATTERN.test(entry))

const buildRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

export function InviteMembersDialog({
  open,
  mode,
  activeAcademyId,
  defaultEmails,
  defaultRole,
  membershipContext,
  onOpenChange,
  onCompleted,
  onError,
  resolveExistingMembership,
  onOpenBulkImport,
}: InviteMembersDialogProps) {
  const subscriptionStartDateId = useId()
  const subscriptionEndDateId = useId()
  const [emailList, setEmailList] = useState<string>(() => (defaultEmails && defaultEmails.length > 0 ? defaultEmails.join('\n') : ''))
  const [selectedRole, setSelectedRole] = useState<MembershipRole>(defaultRole ?? DEFAULT_STUDENT_ROLE)
  const [useCustomDates, setUseCustomDates] = useState(false)
  const [subscriptionStartDate, setSubscriptionStartDate] = useState<Date | undefined>(undefined)
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<Date | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<InviteMembersResponse | null>(null)
  const [errorCopy, setErrorCopy] = useState<string | null>(null)
  const [duplicateNotice, setDuplicateNotice] = useState<ExistingMembershipDetails | null>(null)

  const requestEmails = useMemo(() => {
    if (mode === 'resend' && membershipContext) {
      return [membershipContext.email]
    }
    return parseEmailList(emailList)
  }, [emailList, membershipContext, mode])

  const canSubmit = mode === 'resend' ? Boolean(activeAcademyId && requestEmails.length === 1) : Boolean(activeAcademyId && requestEmails.length > 0)

  useEffect(() => {
    if (mode === 'resend' && membershipContext) {
      setSelectedRole(membershipContext.role)
    }
  }, [mode, membershipContext])

  useEffect(() => {
    if (!open) {
      setEmailList(defaultEmails && defaultEmails.length > 0 ? defaultEmails.join('\n') : '')
      setSelectedRole(defaultRole ?? DEFAULT_STUDENT_ROLE)
      setUseCustomDates(false)
      setSubscriptionStartDate(undefined)
      setSubscriptionEndDate(undefined)
      setResult(null)
      setErrorCopy(null)
      setDuplicateNotice(null)
    }
  }, [open, defaultEmails, defaultRole])

  useEffect(() => {
    if (selectedRole !== 'student' || mode === 'resend') {
      setUseCustomDates(false)
      setSubscriptionStartDate(undefined)
      setSubscriptionEndDate(undefined)
    }
  }, [mode, selectedRole])

  const ensureValidWindow = useCallback((): SubscriptionWindow | null => {
    if (selectedRole !== 'student' || mode === 'resend') {
      return { startDate: null, endDate: null }
    }

    // If not using custom dates, return nulls (backend applies 12-month default)
    if (!useCustomDates) {
      return { startDate: null, endDate: null }
    }

    const startDate = subscriptionStartDate ? format(subscriptionStartDate, 'yyyy-MM-dd') : null
    const endDate = subscriptionEndDate ? format(subscriptionEndDate, 'yyyy-MM-dd') : null

    if (endDate && !startDate) {
      setErrorCopy(inviteDialogCopy.errors.endRequiresStart)
      return null
    }

    if (subscriptionStartDate && subscriptionEndDate && subscriptionStartDate.getTime() > subscriptionEndDate.getTime()) {
      setErrorCopy(inviteDialogCopy.errors.invalidRange)
      return null
    }

    return { startDate, endDate }
  }, [mode, selectedRole, useCustomDates, subscriptionStartDate, subscriptionEndDate])

  const buildBody = useCallback(() => {
    const window = ensureValidWindow()
    if (!window) {
      return null
    }

    return {
      emails: requestEmails,
      role: selectedRole,
      mode,
      academyId: activeAcademyId,
      subscriptionStartDate: window.startDate,
      subscriptionEndDate: window.endDate,
    }
  }, [ensureValidWindow, requestEmails, selectedRole, mode, activeAcademyId])

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      setErrorCopy(null)
      setResult(null)
      setDuplicateNotice(null)

      if (!activeAcademyId) {
        setErrorCopy(inviteDialogCopy.errors.missingAcademy)
        return
      }

      const body = buildBody()
      if (!body) {
        return
      }

      if (body.emails.length === 0) {
        setErrorCopy(inviteDialogCopy.errors.missingEmails)
        return
      }

      setIsSubmitting(true)
      const requestId = buildRequestId()

      try {
        const { data, error } = await supabase.functions.invoke<InviteMembersResponse>('invite-members', {
          body,
          headers: {
            [REQUEST_ID_HEADER]: requestId,
          },
        })

        if (error) {
          const parsed = normalizeEdgeFunctionError(error)
          handleInviteError(parsed, resolveExistingMembership, setErrorCopy, setDuplicateNotice, requestEmails[0])
          onError(parsed)
          return
        }

        if (data) {
          setResult(data)
          onCompleted(data)
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [activeAcademyId, buildBody, onCompleted, onError, requestEmails, resolveExistingMembership],
  )

  const heading = mode === 'resend' ? inviteDialogCopy.headings.resend : inviteDialogCopy.headings.create
  const primaryCta = mode === 'resend' ? 'Resend invite' : 'Send invites'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailPlus className="h-4 w-4" />
            {heading}
          </DialogTitle>
          <DialogDescription>
            {mode === 'resend'
              ? 'Resend the invite email without creating new records.'
              : `Send invite emails so members can sign in at /auth with ${AUTH_METHOD_LIST} using the same address you invite.`}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6 pt-3" onSubmit={handleSubmit}>
          {/* Email Input Section */}
          {mode === 'create' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="invite-emails">Email addresses</Label>
                <Textarea
                  id="invite-emails"
                  placeholder="Paste emails separated by commas, spaces, or line breaks."
                  className="min-h-[100px] font-mono text-sm"
                  value={emailList}
                  onChange={(event) => setEmailList(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Only normalized emails (lowercase) are stored.
                </p>
              </div>

              {/* CSV Import Section */}
              {onOpenBulkImport && (
                <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
                  <FileUp className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">
                      Bulk invite multiple members at once
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={onOpenBulkImport}>
                    <Upload className="h-4 w-4 mr-1.5" />
                    Import CSV
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={membershipContext?.email ?? ''} readOnly className="bg-muted/50" />
              {membershipContext && (
                <p className="text-xs text-muted-foreground">
                  Current status: {STATUS_LABEL[membershipContext.status]}. This re-sends the notification without creating new records.
                </p>
              )}
            </div>
          )}

          {/* Role Selection */}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={selectedRole}
              disabled={mode === 'resend'}
              onValueChange={(value) => setSelectedRole(value as MembershipRole)}
            >
              <SelectTrigger aria-label="Role" className="w-full sm:w-[240px]">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="academy_admin">Academy admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Subscription Period Section - Student only in create mode */}
          {selectedRole === 'student' && mode === 'create' && (
            <Card className="border-dashed">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="custom-dates-toggle" className="cursor-pointer">
                        Custom subscription period
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {useCustomDates
                        ? 'Set specific start and end dates for access'
                        : 'Default: 12-month access from activation'}
                    </p>
                  </div>
                  <Switch
                    id="custom-dates-toggle"
                    checked={useCustomDates}
                    onCheckedChange={setUseCustomDates}
                    aria-label="Enable custom subscription dates"
                  />
                </div>

                {useCustomDates && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t">
                    <div className="space-y-2">
                      <Label htmlFor={subscriptionStartDateId}>Start date</Label>
                      <DatePicker
                        id={subscriptionStartDateId}
                        date={subscriptionStartDate}
                        setDate={setSubscriptionStartDate}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={subscriptionEndDateId}>End date</Label>
                      <DatePicker
                        id={subscriptionEndDateId}
                        date={subscriptionEndDate}
                        setDate={setSubscriptionEndDate}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Resend mode - show existing subscription info */}
          {mode === 'resend' && membershipContext && (
            <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
              <p>
                Existing subscription window:{' '}
                <strong>{formatDateDisplay(membershipContext.subscription_start_date)}</strong> →{' '}
                <strong>{formatDateDisplay(membershipContext.subscription_end_date)}</strong>
              </p>
              <p>This resend reuses the stored window and role.</p>
            </div>
          )}

          {duplicateNotice && (
            <Alert>
              <AlertTitle>{inviteDialogCopy.duplicateNotice.title}</AlertTitle>
              <AlertDescription>
                <div className="space-y-1 text-sm">
                  <p>{inviteDialogCopy.duplicateNotice.guidance}</p>
                  <p>
                    Email <strong>{duplicateNotice.email}</strong> · Status{' '}
                    {STATUS_LABEL[duplicateNotice.status] ?? duplicateNotice.status ?? 'unknown'}
                  </p>
                  <p>
                    Window {formatDateDisplay(duplicateNotice.subscription_start_date)} →{' '}
                    {formatDateDisplay(duplicateNotice.subscription_end_date)}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {errorCopy && (
            <Alert variant="destructive">
              <AlertTitle>Cannot send invites</AlertTitle>
              <AlertDescription>{errorCopy}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert>
              <AlertTitle>Invite summary</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  <li>
                    Processed {result.emails_total} email{result.emails_total === 1 ? '' : 's'}.
                  </li>
                  <li>
                    Created {result.emails_created} record{result.emails_created === 1 ? '' : 's'} · resent {result.emails_resend}.
                  </li>
                  <li>Failures reported: {result.emails_failed}.</li>
                </ul>
                {Array.isArray(result.failures) && result.failures.length > 0 && (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="font-medium text-foreground">Failure details</p>
                    <ul className="list-disc space-y-1 pl-4">
                      {result.failures.slice(0, 5).map((failure, index) => (
                        <li key={`${failure.email}:${index}`}>
                          <span className="font-mono">{failure.email}</span>
                          {failure.reason ? `: ${failure.reason}` : null}
                        </li>
                      ))}
                      {result.failures.length > 5 && (
                        <li>…and {result.failures.length - 5} more.</li>
                      )}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? 'Sending…' : primaryCta}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const handleInviteError = (
  payload: EdgeFunctionErrorPayload,
  resolveExisting: InviteMembersDialogProps['resolveExistingMembership'],
  setErrorCopy: (value: string | null) => void,
  setDuplicateNotice: (value: ExistingMembershipDetails | null) => void,
  fallbackEmail?: string,
) => {
  const normalizedCode = (payload.code ?? '').toUpperCase()
  if (normalizedCode === 'INVITATION_ALREADY_EXISTS') {
    const details = isPlainRecord(payload.details) ? payload.details : null
    const membershipId = Number(details?.membership_id)
    const knownMember =
      resolveExisting({ membershipId: Number.isFinite(membershipId) ? membershipId : undefined }) ??
      (fallbackEmail ? resolveExisting({ email: fallbackEmail }) : null)
    const derived = knownMember ?? buildExistingDetailsFromPayload(details, fallbackEmail)
    setDuplicateNotice(derived)
    setErrorCopy(mapInviteAdminErrorToCopy(payload))
    return
  }

  setDuplicateNotice(null)
  setErrorCopy(mapInviteAdminErrorToCopy(payload))
}

export default InviteMembersDialog
