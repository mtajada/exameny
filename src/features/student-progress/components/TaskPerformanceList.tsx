import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Edit3, BookOpen } from 'lucide-react'
import type { TaskPerformanceItem } from '@/features/student-progress/types.ts'

interface TaskPerformanceListProps {
  tasks: TaskPerformanceItem[]
  context?: 'student' | 'teacher'
  isLoading?: boolean
  title?: string
  description?: string
  emptyMessage?: string
}

const taskTypeStyles = {
  writing: {
    gradient: 'from-blue-500/20 to-blue-500/10',
    text: 'text-blue-700',
    bar: 'from-blue-500 to-blue-600',
    icon: <Edit3 className="h-4 w-4 text-blue-600" />,
  },
  ruoe: {
    gradient: 'from-teal-500/20 to-teal-500/10',
    text: 'text-teal-700',
    bar: 'from-teal-500 to-teal-600',
    icon: <BookOpen className="h-4 w-4 text-teal-600" />,
  },
}

export function TaskPerformanceList({
  tasks,
  context = 'teacher',
  isLoading,
  title = 'Performance by task type',
  description = 'Identify strong and weak tasks based on the average score.',
  emptyMessage = context === 'teacher'
    ? 'This student does not have evaluated practices for this exam yet.'
    : 'Complete practices to see performance by task.',
}: TaskPerformanceListProps) {
  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((key) => (
            <div key={key} className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
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
      <CardContent className="divide-y divide-border/60 p-0">
        {tasks.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          tasks.map((task) => {
            const style = taskTypeStyles[task.taskType]
            return (
              <div key={task.taskTypeId} className="p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-md bg-gradient-to-br ${style.gradient} p-2`}>{style.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{task.taskName}</p>
                      <p className="text-xs text-muted-foreground">{task.count} completed practices</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`border-transparent text-sm ${style.text}`}>
                      {task.avgScore != null ? `${task.avgScore.toFixed(1)}%` : 'No data'}
                    </Badge>
                    <Badge variant="secondary" className="bg-muted text-xs text-muted-foreground">
                      Max {task.maxScore}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 h-2 w-full rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full bg-gradient-to-r ${style.bar}`}
                    style={{ width: `${Math.min(task.avgScore ?? 0, 100)}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

export default TaskPerformanceList
