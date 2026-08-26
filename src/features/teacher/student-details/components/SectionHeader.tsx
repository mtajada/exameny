import { ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils.ts'

export type SectionTone = 'default' | 'primary' | 'info' | 'success' | 'attention'

interface SectionHeaderProps {
  title: string
  helper: string
  tone?: SectionTone
}

export function SectionHeader({ title, helper, tone = 'default' }: SectionHeaderProps) {
  const toneClasses: Record<SectionTone, string> = {
    default: 'text-foreground',
    primary: 'text-sky-900 dark:text-sky-100',
    info: 'text-blue-900 dark:text-blue-100',
    success: 'text-emerald-900 dark:text-emerald-100',
    attention: 'text-amber-900 dark:text-amber-100',
  }

  return (
    <div>
      <div className={cn('flex items-center gap-2 text-sm font-semibold', toneClasses[tone])}>
        <ClipboardList className="h-4 w-4" />
        {title}
      </div>
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  )
}

export default SectionHeader
