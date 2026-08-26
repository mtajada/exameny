import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { cn } from '@/lib/utils.ts'
import { buildTimeDisplayMeta } from '@/utils/time-format.ts'
import type { TeacherStudentWritingsGroups, TeacherWritingItem } from '@/features/teacher/student-details/types.ts'
import SectionHeader from './SectionHeader.tsx'
import EmptyRow from './EmptyRow.tsx'

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
const DATE_LOCALE = 'en-US'

export interface StudentWritingsSectionProps {
  homeworkPending: TeacherWritingItem[]
  homeworkReviewed: TeacherWritingItem[]
  selfPractice: TeacherStudentWritingsGroups['selfPractice']
}

export function StudentWritingsSection({ homeworkPending, homeworkReviewed, selfPractice }: StudentWritingsSectionProps) {
  const selfPracticeTotal = selfPractice.pending.length + selfPractice.reviewed.length

  return (
    <Card className="border-border bg-card shadow-sm dark:border-border/60 dark:bg-card/80">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">Student writings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 rounded-xl border border-sky-300 bg-sky-50/80 p-4 shadow-sm dark:border-sky-500/40 dark:bg-sky-500/10">
          <SectionHeader
            title="Homework awaiting your review"
            helper="These submissions were assigned as homework. AI already scored them and the student is waiting for your feedback."
            tone="primary"
          />
          {homeworkPending.length === 0 ? (
            <EmptyRow message="No homework submissions require your review right now." />
          ) : (
            <div className="space-y-3">
              {homeworkPending.map((item) => (
                <WritingRow key={item.submissionId} item={item} variant="homeworkPending" />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-2 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <Accordion type="single" collapsible className="rounded-xl">
            <AccordionItem value="homework-reviewed">
              <AccordionTrigger className="flex flex-col items-start gap-1 text-left text-sm font-medium text-foreground">
                <span>Reviewed homework ({homeworkReviewed.length})</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Feedback already shared with the student.
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-3">
                {homeworkReviewed.length === 0 ? (
                  <EmptyRow message="There are no reviewed submissions yet." />
                ) : (
                  <div className="space-y-3">
                    {homeworkReviewed.map((item) => (
                      <WritingRow key={item.submissionId} item={item} variant="homeworkReviewed" />
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 shadow-sm dark:border-slate-500/40 dark:bg-slate-500/10">
          <Accordion type="single" collapsible className="rounded-xl">
            <AccordionItem value="self-practice">
              <AccordionTrigger className="flex flex-col items-start gap-1 text-left text-sm font-medium text-foreground">
                <span>Self-practice submissions (AI generated) ({selfPracticeTotal})</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Students created these prompts on their own. Review them when you have time.
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-3">
                {selfPracticeTotal === 0 ? (
                  <EmptyRow message="The student has not submitted any self-practice writings yet." />
                ) : (
                  <div className="space-y-4">
                    {selfPractice.pending.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                          Awaiting your review (optional)
                        </p>
                        {selfPractice.pending.map((item) => (
                          <WritingRow key={item.submissionId} item={item} variant="selfPracticePending" />
                        ))}
                      </div>
                    )}
                    {selfPractice.pending.length > 0 && selfPractice.reviewed.length > 0 && (
                      <div className="border-t border-border/40 dark:border-border/30" />
                    )}
                    {selfPractice.reviewed.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Already reviewed
                        </p>
                        {selfPractice.reviewed.map((item) => (
                          <WritingRow key={item.submissionId} item={item} variant="selfPracticeReviewed" />
                        ))}
                      </div>
                    )}
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

interface WritingRowProps {
  item: TeacherWritingItem
  variant: 'homeworkPending' | 'homeworkReviewed' | 'selfPracticePending' | 'selfPracticeReviewed'
}

function WritingRow({ item, variant }: WritingRowProps) {
  const isPendingAi = item.status === 'pending_ai_evaluation'
  const meta = buildTimeDisplayMeta(item.timeSpentSeconds, item.defaultTimeMinutes)
  const formattedDate = item.submittedAt ? new Date(item.submittedAt).toLocaleDateString(DATE_LOCALE, DATE_FORMAT) : 'No date'
  const actionLabel = variant.includes('Reviewed') || isPendingAi ? 'View' : 'Review'

  const variantClasses: Record<WritingRowProps['variant'], string> = {
    homeworkPending: 'border-sky-500/40 bg-card shadow-sm dark:border-sky-500/40 dark:bg-sky-500/10',
    homeworkReviewed: 'border-emerald-400/40 bg-card shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10',
    selfPracticePending: 'border-amber-400/40 bg-card shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10',
    selfPracticeReviewed: 'border-slate-200/60 bg-card shadow-sm dark:border-slate-500/30 dark:bg-slate-500/10',
  }

  const toneColor: Record<typeof meta.tone, string> = {
    neutral: 'text-muted-foreground dark:text-muted-foreground',
    positive: 'text-emerald-700 dark:text-emerald-300',
    negative: 'text-rose-700 dark:text-rose-300',
  }

  const helperCopy = (() => {
    if (meta.suggestedLabel === 'Not set') return 'No recommended target'
    if (!meta.hasData) return `Target time: ${meta.suggestedLabel}`
    if (meta.tone === 'negative') return `Above the target (${meta.suggestedLabel})`
    if (meta.tone === 'positive') return `On track with ${meta.suggestedLabel}`
    return `Target time: ${meta.suggestedLabel}`
  })()

  const actualLabel = meta.hasData && meta.actualLabel !== 'N/A' ? meta.actualLabel : 'No data'
  const buttonVariant: 'default' | 'outline' | 'secondary' = (() => {
    if (variant === 'homeworkPending') return 'default'
    if (variant === 'selfPracticePending') return 'secondary'
    return 'outline'
  })()

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between',
        variantClasses[variant],
      )}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <span>{item.taskName}</span>
          <StatusBadge variant={variant} status={item.status} />
          <OriginBadge origin={item.origin} />
        </div>
        <p className="text-xs text-muted-foreground">Submitted on {formattedDate}</p>
        <p className={cn('text-xs', toneColor[meta.tone])}>
          Time spent: {actualLabel} · {helperCopy}
        </p>
        {item.origin === 'self_practice' && (
          <p className="text-xs text-muted-foreground">
            Student-generated prompt · {isPendingAi ? 'AI evaluation in progress.' : 'AI evaluation complete.'}
          </p>
        )}
        {item.origin === 'assigned' && isPendingAi && (
          <p className="text-xs text-muted-foreground">AI evaluation in progress.</p>
        )}
      </div>
      <Button
        variant={buttonVariant}
        size="sm"
        className="w-full sm:w-auto"
        onClick={() => {
          globalThis.location.assign(`/evaluation/${item.submissionId}`)
        }}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

function StatusBadge({ variant, status }: { variant: WritingRowProps['variant']; status: TeacherWritingItem['status'] }) {
  if (status === 'pending_ai_evaluation') {
    return (
      <Badge className="border-transparent bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100">
        AI processing
      </Badge>
    )
  }

  switch (variant) {
    case 'homeworkPending':
      return (
        <Badge className="border-transparent bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100">
          Needs teacher review
        </Badge>
      )
    case 'selfPracticePending':
      return (
        <Badge className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100">
          Optional review
        </Badge>
      )
    case 'homeworkReviewed':
      return (
        <Badge className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100">
          Reviewed
        </Badge>
      )
    case 'selfPracticeReviewed':
      return (
        <Badge className="border-transparent bg-slate-200 text-slate-800 dark:bg-slate-500/30 dark:text-slate-100">
          Reviewed
        </Badge>
      )
  }
}

function OriginBadge({ origin }: { origin: TeacherWritingItem['origin'] }) {
  if (origin === 'assigned') {
    return (
      <Badge className="border-transparent bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100">
        Homework
      </Badge>
    )
  }

  return (
    <Badge className="border-transparent bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-100">
      Self practice
    </Badge>
  )
}

export default StudentWritingsSection
