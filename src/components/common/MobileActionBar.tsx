import type { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils.ts'

interface MobileActionBarProps {
  className?: string
  show?: boolean
  ariaLabel?: string
  display?: 'mobile' | 'desktop' | 'all'
}

interface MobileActionSpacerProps {
  className?: string
  display?: 'mobile' | 'desktop' | 'all'
  height?: string
}

const baseClasses = [
  'fixed bottom-0 left-0 right-0 z-40',
  'bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-t',
  'px-4 pb-[calc(env(safe-area-inset-bottom,0)+12px)] pt-3 shadow-[0_-6px_20px_rgba(0,0,0,0.06)]',
]

const displayClasses: Record<'mobile' | 'desktop' | 'all', string> = {
  mobile: 'md:hidden',
  desktop: 'hidden md:block',
  all: '',
}

const defaultSpacerHeight = 'calc(env(safe-area-inset-bottom, 0) + 88px)'

function MobileActionBar({ children, className, show = true, ariaLabel, display = 'mobile' }: PropsWithChildren<MobileActionBarProps>) {
  if (!show) return null

  return (
    <div
      className={cn(baseClasses, displayClasses[display], className)}
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  )
}

function MobileActionSpacer({ className, display = 'mobile', height = defaultSpacerHeight }: MobileActionSpacerProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('w-full', displayClasses[display], className)}
      style={{ height }}
    />
  )
}

export default MobileActionBar
export { MobileActionSpacer }
