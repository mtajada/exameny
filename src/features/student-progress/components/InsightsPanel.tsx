import type { JSX } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Lightbulb, AlertTriangle, Target, Star } from 'lucide-react'
import type { ProgressInsight } from '@/features/student-progress/types.ts'

interface InsightsPanelProps {
  insights: ProgressInsight[]
  context?: 'student' | 'teacher'
  isLoading?: boolean
  title?: string
  description?: string
}

const iconMap: Record<ProgressInsight['type'], JSX.Element> = {
  strength: <Star className="h-4 w-4 text-emerald-600" />,
  improvement: <Target className="h-4 w-4 text-amber-600" />,
  attention: <AlertTriangle className="h-4 w-4 text-rose-600" />,
}

export function InsightsPanel({
  insights,
  context = 'teacher',
  isLoading,
  title = 'Actionable insights',
  description = context === 'teacher'
    ? 'Ready-to-share summary to guide your next conversation with the student.'
    : 'Recommendations to keep improving your results.',
}: InsightsPanelProps) {
  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!insights || insights.length === 0) {
    return (
      <Card className="border-border bg-card/80">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Lightbulb className="h-5 w-5" />
          No insights available yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg font-semibold text-foreground">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight, index) => (
          <div key={`${insight.type}-${index}`} className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/40 p-3">
            <div className="rounded-md bg-background p-2">{iconMap[insight.type]}</div>
            <div className="text-sm text-foreground">
              <p className="font-medium">
                {capitalizeType(insight.type)}
                {insight.taskType ? ` · ${insight.taskType === 'writing' ? 'Writing' : 'R&UoE'}` : ''}
              </p>
              <p className="mt-1 text-muted-foreground">{insight.message}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function capitalizeType(type: ProgressInsight['type']) {
  if (type === 'strength') return 'Strength'
  if (type === 'attention') return 'Needs attention'
  return 'Opportunity'
}

export default InsightsPanel
