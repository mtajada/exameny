import { Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils.ts'

interface SubmissionTimerProps {
  formatted: string
  isSyncing?: boolean
  hasUnsyncedChanges?: boolean
  className?: string
}

export function SubmissionTimer({ formatted, isSyncing = false, hasUnsyncedChanges = false, className }: SubmissionTimerProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-muted/60 px-3 py-2 shadow-sm transition-colors dark:bg-muted/40',
        className,
      )}
    >
      <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
      <div className="flex flex-col leading-none">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Time Spent</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">{formatted}</span>
      </div>
      {isSyncing ? (
        <Loader2 className="ml-1 h-4 w-4 animate-spin text-primary" aria-label="Syncing time" />
      ) : hasUnsyncedChanges ? (
        <span
          className="ml-1 h-2 w-2 rounded-full bg-amber-500"
          aria-label="Unsynced time data"
          title="Unsynced time data"
        />
      ) : null}
    </div>
  )
}

export default SubmissionTimer
