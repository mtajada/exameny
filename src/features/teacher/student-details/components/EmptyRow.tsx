import { Inbox } from 'lucide-react'

interface EmptyRowProps {
  message: string
}

export function EmptyRow({ message }: EmptyRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-border/60 bg-background p-4 text-xs text-muted-foreground dark:border-border/40 dark:bg-muted/10">
      <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

export default EmptyRow
