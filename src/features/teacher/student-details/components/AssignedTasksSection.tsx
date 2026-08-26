import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { cn } from '@/lib/utils.ts'
import type { TeacherAssignedTaskItem } from '@/features/teacher/student-details/types.ts'
import EmptyRow from './EmptyRow.tsx'
import SectionHeader from './SectionHeader.tsx'

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
const DATE_LOCALE = 'en-US'

export interface AssignedTasksSectionProps {
  pending: TeacherAssignedTaskItem[]
  completed: TeacherAssignedTaskItem[]
}

export function AssignedTasksSection({ pending, completed }: AssignedTasksSectionProps) {
  return (
    <Card className="border-border bg-card shadow-sm dark:border-border/60 dark:bg-card/80">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">Assigned Tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <SectionHeader
            title="Pending submission"
            helper="Assigned activities without a confirmed submission."
            tone="attention"
          />
          {pending.length === 0 ? (
            <EmptyRow message="No pending tasks." />
          ) : (
            <div className="space-y-3">
              {pending.map((task) => (
                <AssignedTaskRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-2 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <Accordion type="single" collapsible>
            <AccordionItem value="completed">
              <AccordionTrigger className="text-sm font-medium text-foreground">
                Completed ({completed.length})
              </AccordionTrigger>
              <AccordionContent className="pt-3">
                {completed.length === 0 ? (
                  <EmptyRow message="No completed tasks yet." />
                ) : (
                  <div className="space-y-3">
                    {completed.map((task) => (
                      <AssignedTaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CardContent>
    </Card>
  )
}

function AssignedTaskRow({ task }: { task: TeacherAssignedTaskItem }) {
  const assignedDate = new Date(task.assignedAt).toLocaleDateString(DATE_LOCALE, DATE_FORMAT)
  const statusCopy = mapAssignedStatus(task.status)
  const isPending = task.status === 'pending' || task.status === 'viewed'

  const containerClass = isPending
    ? 'border-amber-400/60 bg-card shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10'
    : 'border-emerald-400/60 bg-card shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10'

  const statusClass = isPending
    ? 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100'
    : 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100'

  const categoryClass =
    task.taskCategory === 'ruoe'
      ? 'border-transparent bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-100'
      : task.taskCategory === 'writing'
        ? 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100'
        : 'border-transparent bg-muted text-muted-foreground dark:bg-muted/40 dark:text-muted-foreground'

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between',
        containerClass,
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span>{task.taskName}</span>
          <Badge className={statusClass}>{statusCopy}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Assigned on {assignedDate}</p>
        <Badge className={cn('text-xs', categoryClass)}>
          {task.taskCategory === 'ruoe' ? 'R&UoE' : task.taskCategory === 'writing' ? 'Writing' : 'Activity'}
        </Badge>
      </div>
      {task.submissionId ? (
        <Button size="sm" variant="outline" onClick={() => globalThis.location.assign(`/evaluation/${task.submissionId}`)}>
          View submission
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled>
          No submission
        </Button>
      )}
    </div>
  )
}

function mapAssignedStatus(status: TeacherAssignedTaskItem['status']) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'viewed':
      return 'Viewed'
    case 'submitted':
      return 'Submitted'
    case 'evaluated':
      return 'Evaluated'
    default:
      return 'Unknown status'
  }
}

export default AssignedTasksSection
