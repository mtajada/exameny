import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  title: string
  description?: string
  className?: string
  right?: ReactNode
  titleClassName?: string
  descriptionClassName?: string
  icon?: ReactNode
  iconClassName?: string
}

function SectionHeader({
  title,
  description,
  className,
  right,
  titleClassName,
  descriptionClassName,
  icon,
  iconClassName,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-2 md:flex-row md:items-center md:justify-between', className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <div className={cn('mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary', iconClassName)}>
            {icon}
          </div>
        ) : null}
        <div>
          <h2 className={cn('text-xl md:text-2xl font-semibold text-foreground', titleClassName)}>{title}</h2>
          {description ? (
            <p className={cn('mt-0.5 text-sm text-muted-foreground', descriptionClassName)}>{description}</p>
          ) : null}
        </div>
      </div>
      {right ? <div className="mt-2 md:mt-0">{right}</div> : null}
    </div>
  )
}

export default SectionHeader
