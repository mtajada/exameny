import { useCallback, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/contexts/useAuth'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const SUPPORTED_TYPES = ['text/csv']

type Role = 'student' | 'teacher' | 'academy_admin'

type ImportRow = {
  email: string
  full_name: string
  role?: Role
  class_name?: string
  class_description?: string
  teacher_email?: string
  subscription_end_date?: string
}

type DryRunIssue = { row: number; email?: string; error?: string; warnings?: string[] }
type DryRunDetail = { row: number; email: string; actions: string[]; warnings?: string[]; error?: string }

type DryRunSummary = Record<string, number>

type DryRunResult = {
  summary: DryRunSummary
  issues: DryRunIssue[]
  details: DryRunDetail[]
}

type FormOptions = {
  createClasses: boolean
  sendEmailsToNew: boolean
  resendPendingInvites: boolean
  sendLoginReminders: boolean
  updateSubscriptionForExisting: boolean
}

const DEFAULT_OPTIONS: FormOptions = {
  createClasses: true,
  sendEmailsToNew: true,
  resendPendingInvites: false,
  sendLoginReminders: false,
  updateSubscriptionForExisting: true,
}

interface BulkImportDialogProps {
  open: boolean
  onOpenChange: (value: boolean) => void
  onCompleted: () => void
}

export function BulkImportDialog({ open, onOpenChange, onCompleted }: BulkImportDialogProps) {
  const { activeAcademyId } = useAuth()

  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [options, setOptions] = useState<FormOptions>(DEFAULT_OPTIONS)
  const [isParsing, setIsParsing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)

  const supportedMimeTypes = useMemo(() => [...SUPPORTED_TYPES, '.csv'].join(','), [])
  const issues = useMemo(() => dryRunResult?.issues ?? [], [dryRunResult])
  const summary = dryRunResult?.summary ?? null

  const errorIssues = useMemo(() => issues.filter((issue) => !!issue.error), [issues])
  const warningIssues = useMemo(() => issues.filter((issue) => !issue.error && issue.warnings?.length), [issues])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setFile(null)
    setRows([])
    setDryRunResult(null)
    setOptions(DEFAULT_OPTIONS)
  }, [onOpenChange])

  const parseFile = useCallback(async (fileToParse: File | null) => {
    setRows([])
    setDryRunResult(null)
    if (!fileToParse) return

    setIsParsing(true)
    try {
      if (fileToParse.type === 'text/csv' || fileToParse.name.toLowerCase().endsWith('.csv')) {
        const text = await fileToParse.text()
        setRows(parseCsv(text))
      } else {
        toast({ title: 'Unsupported file', description: 'Please upload a CSV file', variant: 'destructive' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not parse the file'
      toast({ title: 'Parse error', description: message, variant: 'destructive' })
    } finally {
      setIsParsing(false)
    }
  }, [])

  const handleFileChange = useCallback(
    async (fileList: FileList | null) => {
      const nextFile = fileList?.[0] ?? null
      setFile(nextFile)
      await parseFile(nextFile)
    },
    [parseFile],
  )

  const handleOptionChange = useCallback((key: keyof FormOptions, value: boolean) => {
    setOptions((prev) => ({ ...prev, [key]: value }))
  }, [])

  const invokeImport = useCallback(
    async (dryRun: boolean) => {
      if (rows.length === 0) return
      if (!activeAcademyId) {
        toast({
          title: 'Select an active academy',
          description: 'Return to the access flow and choose the academy you want to manage before importing a CSV.',
          variant: 'destructive',
        })
        return
      }
      setIsSubmitting(true)
      try {
        const { data, error } = await supabase.functions.invoke<DryRunResult>('bulk-import-roster', {
          body: {
            rows,
            options: {
              ...options,
              dryRun,
            },
            academyId: activeAcademyId,
          },
        })
        if (error) throw new Error(error.message)
        if (dryRun) {
          setDryRunResult(data)
          toast({ title: 'Preview ready', description: 'Review the summary before confirming.' })
        } else {
          toast({ title: 'Import completed', description: 'Members and classes updated successfully.' })
          handleClose()
          onCompleted()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please try again'
        toast({ title: dryRun ? 'Preview failed' : 'Import failed', description: message, variant: 'destructive' })
      } finally {
        setIsSubmitting(false)
      }
    },
    [rows, options, handleClose, onCompleted, activeAcademyId],
  )

  const handleDownloadTemplate = useCallback(() => {
    const headers = ['email', 'full_name', 'role', 'class_name', 'class_description', 'teacher_email', 'subscription_end_date']
    const blob = new Blob([[headers.join(',')].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'bulk-import-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }, [])

  const rowCount = rows.length
  const hasPreview = !!dryRunResult

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Bulk Import (CSV)</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="bulk-import-file">Upload CSV file</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
                Download template
              </Button>
            </div>
            <Input id="bulk-import-file" type="file" accept={supportedMimeTypes} onChange={(event) => handleFileChange(event.target.files)} />
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
            <p className="text-xs text-muted-foreground">Tip: From Excel, use “Save As” → CSV (UTF-8) and upload the CSV.</p>
          </div>

          {!activeAcademyId && (
            <Alert variant="destructive">
              <AlertTitle>Select an academy</AlertTitle>
              <AlertDescription>
                Pick an active academy from the navigation first so we can link the imported records to the proper organization.
              </AlertDescription>
            </Alert>
          )}

          <OptionGrid options={options} onChange={handleOptionChange} />

          <div className="rounded-md border bg-muted/50 p-4 text-sm text-muted-foreground">
            {isParsing && <p>Parsing file...</p>}
            {!isParsing && rowCount > 0 && <p>Parsed {rowCount} rows.</p>}
            {hasPreview && summary && <SummaryPanel summary={summary} errors={errorIssues.length} warnings={warningIssues.length} />}
          </div>

          {hasPreview && (errorIssues.length > 0 || warningIssues.length > 0) && (
            <IssuesPanel errors={errorIssues} warnings={warningIssues} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => invokeImport(true)} disabled={isSubmitting || rowCount === 0 || !activeAcademyId}>
            Preview Changes
          </Button>
          <Button onClick={() => invokeImport(false)} disabled={isSubmitting || rowCount === 0 || !activeAcademyId}>
            Confirm Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OptionGrid({ options, onChange }: { options: FormOptions; onChange: (key: keyof FormOptions, value: boolean) => void }) {
  const entries: Array<{ key: keyof FormOptions; label: string }> = [
    { key: 'createClasses', label: 'Create classes' },
    { key: 'sendEmailsToNew', label: 'Send invites to new users' },
    { key: 'resendPendingInvites', label: 'Resend pending invites' },
    { key: 'sendLoginReminders', label: 'Send login reminders for existing users' },
    { key: 'updateSubscriptionForExisting', label: 'Update subscription for existing' },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {entries.map(({ key, label }) => (
        <ToggleRow key={key} label={label} checked={options[key]} onCheckedChange={(checked) => onChange(key, checked)} />
      ))}
    </div>
  )
}

function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded border p-2">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function SummaryPanel({ summary, errors, warnings }: { summary: DryRunSummary; errors: number; warnings: number }) {
  const entries = Object.entries(summary)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-foreground">Preview summary</span>
        <BadgeCount count={errors} label="Errors" variant={errors ? 'error' : 'muted'} />
        <BadgeCount count={warnings} label="Warnings" variant={warnings ? 'warning' : 'muted'} />
      </div>
      <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded border bg-background p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{key.replace(/([A-Z])/g, ' $1').trim()}</dt>
            <dd className="text-lg font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function BadgeCount({ count, label, variant }: { count: number; label: string; variant: 'error' | 'warning' | 'muted' }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium'
  const palette = {
    error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    muted: 'bg-muted text-muted-foreground',
  } as const
  return (
    <span className={`${base} ${palette[variant]}`}>
      <span className="font-semibold">{count}</span>
      {label}
    </span>
  )
}

function IssuesPanel({ errors, warnings }: { errors: DryRunIssue[]; warnings: DryRunIssue[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Issues detected</h3>
      <ScrollArea className="max-h-56 rounded border bg-background">
        <div className="space-y-3 p-3 text-sm">
          {errors.map((issue) => (
            <IssueRow key={`error-${issue.row}-${issue.email ?? issue.row}`} issue={issue} tone="error" />
          ))}
          {warnings.map((issue) => (
            <IssueRow key={`warn-${issue.row}-${issue.email ?? issue.row}`} issue={issue} tone="warning" />
          ))}
          {errors.length === 0 && warnings.length === 0 && <p className="text-muted-foreground">No issues reported.</p>}
        </div>
      </ScrollArea>
    </div>
  )
}

function IssueRow({ issue, tone }: { issue: DryRunIssue; tone: 'error' | 'warning' }) {
  const palette = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200'
    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
  const warnings = issue.warnings ?? []

  return (
    <div className={`rounded border p-3 ${palette}`}>
      <div className="flex items-center justify-between text-xs uppercase tracking-wide">
        <span>Row {issue.row >= 0 ? issue.row + 1 : '—'}</span>
        {issue.email && <span>{issue.email}</span>}
      </div>
      {issue.error && <p className="mt-2 text-sm font-medium">{issue.error}</p>}
      {warnings.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
          {warnings.map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// CSV parsing helpers
function parseCsv(text: string): ImportRow[] {
  const sanitized = text.replace(/^\ufeff/, '')
  const lines = sanitized.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase())
  const output: ImportRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const columns = splitCsvLine(lines[i])
    const row: Record<string, string> = {}
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex++) {
      row[headers[columnIndex]] = (columns[columnIndex] || '').trim()
    }
    output.push(normalizeRow(row))
  }

  return output
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (character === '"') {
      const nextChar = line[index + 1]
      if (inQuotes && nextChar === '"') {
        current += '"'
        index++
      } else {
        inQuotes = !inQuotes
      }
    } else if (character === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += character
    }
  }

  result.push(current)
  return result
}

const HEADER_MAP: Record<string, keyof ImportRow> = {
  email: 'email',
  correo: 'email',
  mail: 'email',
  full_name: 'full_name',
  name: 'full_name',
  nombre: 'full_name',
  role: 'role',
  rol: 'role',
  class_name: 'class_name',
  clase: 'class_name',
  grupo: 'class_name',
  class: 'class_name',
  class_description: 'class_description',
  descripcion: 'class_description',
  description: 'class_description',
  teacher_email: 'teacher_email',
  profesor_email: 'teacher_email',
  teacher: 'teacher_email',
  profesor: 'teacher_email',
  subscription_end_date: 'subscription_end_date',
  fecha_fin: 'subscription_end_date',
  end_date: 'subscription_end_date',
}

function normalizeRow(source: Record<string, string>): ImportRow {
  const row: ImportRow = { email: '', full_name: '' }

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = HEADER_MAP[rawKey.trim().toLowerCase()]
    if (!key) continue

    if (key === 'role') {
      const normalized = rawValue.trim().toLowerCase()
      if (normalized === 'student' || normalized === 'teacher' || normalized === 'academy_admin') {
        row.role = normalized as Role
      }
      continue
    }

    row[key] = rawValue.trim() as typeof row[typeof key]
  }

  if (row.email) row.email = row.email.toLowerCase()
  if (row.teacher_email) row.teacher_email = row.teacher_email.toLowerCase()
  if (row.class_name) row.class_name = row.class_name.trim().replace(/\s+/g, ' ')

  return row
}

export default BulkImportDialog
