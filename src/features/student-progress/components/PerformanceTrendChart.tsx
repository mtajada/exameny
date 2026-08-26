import type { JSX } from 'react'
import { memo, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import { Edit3, BookOpen, BarChart3, TrendingUp } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  type TooltipProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import type { PerformanceTrendPoint } from '@/features/student-progress/types.ts'

export type TrendTaskFilter = 'all' | 'writing' | 'ruoe'

interface PerformanceTrendChartProps {
  data: PerformanceTrendPoint[]
  filter: TrendTaskFilter
  onFilterChange?: (filter: TrendTaskFilter) => void
  isLoading?: boolean
  context?: 'student' | 'teacher'
  title?: string
  description?: string
  emptyCtaHref?: string
}

const filterOptions: Array<{ key: TrendTaskFilter; label: string; icon: JSX.Element }> = [
  { key: 'all', label: 'All', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'writing', label: 'Writing', icon: <Edit3 className="h-4 w-4" /> },
  { key: 'ruoe', label: 'R&UoE', icon: <BookOpen className="h-4 w-4" /> },
]

export const PerformanceTrendChart = memo(function PerformanceTrendChart({
  data,
  filter,
  onFilterChange,
  isLoading,
  context = 'teacher',
  title = 'Performance trend',
  description = 'Compare Writing and R&UoE results over time.',
  emptyCtaHref,
}: PerformanceTrendChartProps) {
  const filteredData = useMemo(() => applyFilter(data, filter), [data, filter])

  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-0">
        <div className="space-y-1">
          <CardTitle className="text-xl font-semibold text-foreground">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Tabs value={filter} onValueChange={(value) => onFilterChange?.(value as TrendTaskFilter)}>
          <TabsList className="bg-muted/50">
            {filterOptions.map((option) => (
              <TabsTrigger key={option.key} value={option.key} className="flex items-center gap-2 text-xs sm:text-sm">
                {option.icon}
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="pt-4">
        {filteredData.length > 0 ? (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData} margin={{ top: 16, right: 24, bottom: 0, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="index" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<TrendTooltip />} />
                <Legend wrapperStyle={{ paddingTop: 16 }} />
                {(filter === 'all' || filter === 'writing') && (
                  <Line
                    type="monotone"
                    dataKey="writingScore"
                    name="Writing"
                    stroke="#2563EB"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: '#2563EB' }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                )}
                {(filter === 'all' || filter === 'ruoe') && (
                  <Line
                    type="monotone"
                    dataKey="ruoeScore"
                    name="R&UoE"
                    stroke="#14B8A6"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: '#14B8A6' }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyTrendState context={context} emptyCtaHref={emptyCtaHref} />
        )}
      </CardContent>
    </Card>
  )
})

PerformanceTrendChart.displayName = 'PerformanceTrendChart'

function applyFilter(data: PerformanceTrendPoint[], filter: TrendTaskFilter) {
  const nullRuoeScore: PerformanceTrendPoint['ruoeScore'] = null
  const nullWritingScore: PerformanceTrendPoint['writingScore'] = null
  const nullAiScore: PerformanceTrendPoint['aiScore'] = null
  const nullTeacherScore: PerformanceTrendPoint['teacherScore'] = null

  if (filter === 'writing') {
    return data.map((point) => ({ ...point, ruoeScore: nullRuoeScore }))
  }
  if (filter === 'ruoe') {
    return data.map((point) => ({
      ...point,
      writingScore: nullWritingScore,
      aiScore: nullAiScore,
      teacherScore: nullTeacherScore,
    }))
  }
  return data
}

function TrendTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-card/95 p-3 shadow">
        <p className="mb-1 text-sm font-medium text-foreground">Practice #{label}</p>
        <div className="space-y-1 text-xs text-muted-foreground">
          {payload.map((entry, index) => {
            if (entry.value == null) return null
            return (
              <div key={index} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color ?? '#2563EB' }} />
                <span className="font-medium text-foreground">{entry.name}</span>
                <span>{Number(entry.value).toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  return null
}

interface EmptyTrendStateProps {
  context: 'student' | 'teacher'
  emptyCtaHref?: string
}

function EmptyTrendState({ context, emptyCtaHref }: EmptyTrendStateProps) {
  const message =
    context === 'teacher'
      ? 'There are not enough evaluated practices yet.'
      : 'Complete your first practices to unlock the trend.'
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <div className="rounded-full bg-muted p-4">
        <TrendingUp className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {emptyCtaHref ? (
        <Button size="sm" asChild>
          <a href={emptyCtaHref}>{context === 'teacher' ? 'Assign practice' : 'Start practice'}</a>
        </Button>
      ) : null}
      <Badge variant="secondary" className="text-xs text-muted-foreground">At least two evaluated practices are required</Badge>
    </div>
  )
}

export default PerformanceTrendChart
