import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Activity, Edit3, BookOpen, TrendingUp, TrendingDown, Minus, Target } from 'lucide-react'
import type { ProgressAggregateMetrics } from '@/features/student-progress/types.ts'
import { cn } from '@/lib/utils.ts'

export type ProgressSummaryContext = 'student' | 'teacher'

export interface ProgressSummaryCopy {
  title: string
  description?: string
  totalLabel: string
  writingLabel: string
  ruoeLabel: string
  weeklyLabel: string
  weeklyHint?: string
}

interface ProgressSummaryCardsProps {
  metrics: ProgressAggregateMetrics | null
  context?: ProgressSummaryContext
  isLoading?: boolean
  examName?: string | null
  copyOverrides?: Partial<ProgressSummaryCopy>
}

const defaultCopy: Record<ProgressSummaryContext, ProgressSummaryCopy> = {
  student: {
    title: 'Progress summary',
    description: 'Track how your results evolve by task type.',
    totalLabel: 'Total practices',
    writingLabel: 'Writing average',
    ruoeLabel: 'Reading and Use of English average',
    weeklyLabel: 'Last 7 days',
    weeklyHint: 'Completed practices',
  },
  teacher: {
    title: 'Progress summary',
    description: 'Quick snapshot to decide the next step with this student.',
    totalLabel: 'Total practices',
    writingLabel: 'Writing average (AI)',
    ruoeLabel: 'Reading and Use of English average',
    weeklyLabel: 'Recent activity',
    weeklyHint: 'Practices in 7 days',
  },
}

export function ProgressSummaryCards({
  metrics,
  context = 'teacher',
  isLoading,
  examName,
  copyOverrides,
}: ProgressSummaryCardsProps) {
  const copy = { ...defaultCopy[context], ...copyOverrides }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          {examName && <Skeleton className="h-6 w-32" />}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((key) => (
            <Card key={key} className="border-border bg-card">
              <CardContent className="p-6">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-3 h-8 w-24" />
                <Skeleton className="mt-2 h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <Card className="border-dashed border-border bg-card/80">
        <CardContent className="flex flex-col items-start gap-2 p-6 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{copy.title}</span>
          <span>There is no evaluated data to display.</span>
        </CardContent>
      </Card>
    )
  }

  const trendIcon = getTrendIcon(metrics.improvementTrend)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">{copy.title}</h2>
          {copy.description && <p className="text-sm text-muted-foreground">{copy.description}</p>}
        </div>
        {examName && (
          <Badge
            variant="secondary"
            className="shrink-0 text-xs dark:border-primary/30 dark:bg-primary/10 dark:text-primary"
          >
            <Target className="mr-1 h-3 w-3" />
            {examName}
          </Badge>
        )}
      </div>

      <div className="overflow-x-auto pb-2 sm:overflow-visible">
        <div
          className="flex min-w-max gap-4 snap-x snap-mandatory sm:min-w-0 sm:grid sm:grid-cols-2 sm:snap-none xl:grid-cols-4"
          role="list"
          aria-label="Progress summary"
        >
          <SummaryCard
            label={copy.totalLabel}
            value={metrics.totalTasks}
            icon={<Activity className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />}
            helper="Logged practices"
          />
          <SummaryCard
            label={copy.writingLabel}
            value={metrics.avgWritingScore != null ? `${metrics.avgWritingScore.toFixed(1)}%` : 'N/A'}
            icon={<Edit3 className="h-5 w-5 text-blue-600 dark:text-blue-300" />}
            helper={`${metrics.writingTasks} writing tasks`}
          />
          <SummaryCard
            label={copy.ruoeLabel}
            value={metrics.avgRuoeScore != null ? `${metrics.avgRuoeScore.toFixed(1)}%` : 'N/A'}
            icon={<BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-300" />}
            helper={`${metrics.ruoeTasks} R&UoE tasks`}
          />
          <SummaryCard
            label={copy.weeklyLabel}
            value={metrics.weeklyCompleted}
            icon={trendIcon.icon}
            helper={copy.weeklyHint ?? 'Last 7 days'}
            badgeVariant={trendIcon.badge}
            badgeText={trendIcon.label}
          />
        </div>
      </div>
    </div>
  )
}

interface SummaryCardProps {
  label: string
  value: string | number
  helper?: string
  icon: ReactNode
  badgeText?: string | null
  badgeVariant?: 'success' | 'attention' | 'neutral'
}

function SummaryCard({ label, value, helper, icon, badgeText, badgeVariant = 'neutral' }: SummaryCardProps) {
  const badgeColor = getBadgeClass(badgeVariant)
  return (
    <Card
      role="listitem"
      className="min-w-[240px] snap-start border-border bg-card shadow-sm dark:border-border/70 dark:bg-card/80 sm:min-w-0"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="rounded-full bg-muted p-2 text-muted-foreground dark:bg-muted/40">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-foreground">{value}</span>
          {badgeText ? (
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', badgeColor)}>{badgeText}</span>
          ) : null}
        </div>
        {helper && <p className="mt-2 text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  )
}

function getTrendIcon(trend: ProgressAggregateMetrics['improvementTrend']) {
  switch (trend) {
    case 'up':
      return {
        icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />,
        label: 'Uptrend',
        badge: 'success' as const,
      }
    case 'down':
      return {
        icon: <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-300" />,
        label: 'Downtrend',
        badge: 'attention' as const,
      }
    default:
      return {
        icon: <Minus className="h-5 w-5 text-muted-foreground" />,
        label: 'Stable',
        badge: 'neutral' as const,
      }
  }
}

function getBadgeClass(variant: 'success' | 'attention' | 'neutral') {
  if (variant === 'success') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
  }
  if (variant === 'attention') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200'
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-200'
}

export default ProgressSummaryCards
