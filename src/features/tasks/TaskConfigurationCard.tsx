import { useMemo, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { School } from 'lucide-react'
import { RuoEAssignmentSummary } from '@/types/assignments.ts'
import { formatGeneratedAt } from '@/features/ruoe/generation/ruoeGenerationUtils.ts'
import { isRuoeTaskCode } from '@/utils/exam-task-meta.ts'
import { getTaskDisplayName } from './taskDisplayUtils.ts'

export interface TaskConfigurationExamOption {
  id: number
  code: string
  name: string
}

export interface TaskConfigurationLevelOption {
  id: number
  name: string
  code: string | null
}

export interface TaskConfigurationTaskTypeOption {
  id: number
  name: string
  taskCode: string
  description: string | null
  defaultTimeMinutes: number | null
}

interface TaskConfigurationHeadingCopy {
  stepLabel?: string
  title?: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  iconClassName?: string
}

interface TaskConfigurationPlaceholderCopy {
  exam?: string
  level?: string
  task?: string
}

interface TaskConfigurationFieldLabels {
  exam?: string
  level?: string
  taskType?: string
}

interface TaskConfigurationAttachedCopy {
  title?: string
  description?: (context: { summary: RuoEAssignmentSummary | null; taskLabel: string | null }) => ReactNode
}

export interface TaskConfigurationCardCopy {
  heading?: TaskConfigurationHeadingCopy
  placeholders?: TaskConfigurationPlaceholderCopy
  fieldLabels?: TaskConfigurationFieldLabels
  attached?: TaskConfigurationAttachedCopy
}

export interface TaskConfigurationCardProps {
  exams: TaskConfigurationExamOption[]
  levels: TaskConfigurationLevelOption[]
  taskTypes: TaskConfigurationTaskTypeOption[]
  selectedTaskType?: TaskConfigurationTaskTypeOption | null
  selectedExamId: string
  onSelectExam: (value: string) => void
  selectedLevelId: string
  onSelectLevel: (value: string) => void
  selectedTaskTypeId: string
  onSelectTask: (value: string) => void
  loading: { exams: boolean; levels: boolean; tasks: boolean }
  attachedExerciseSummary?: RuoEAssignmentSummary | null
  copy?: TaskConfigurationCardCopy
  className?: string
}

const DEFAULT_COPY: Required<Pick<TaskConfigurationCardCopy, 'heading' | 'placeholders' | 'fieldLabels' | 'attached'>> = {
  heading: {
    stepLabel: '2.',
    title: 'Configure Task Details',
    description: 'Select the exam, level, and task type that best fits the assignment.',
    icon: School,
    iconClassName: 'h-5 w-5 text-blue-600',
  },
  placeholders: {
    exam: 'Choose exam',
    level: 'Choose level',
    task: 'Choose task type',
  },
  fieldLabels: {
    exam: 'Exam',
    level: 'Level',
    taskType: 'Task type',
  },
  attached: {
    title: 'Generated exercise attached',
    description: ({ summary, taskLabel }) => (
      <>
        {taskLabel
          ? `${taskLabel} is already attached to this assignment.`
          : 'A generated Reading & Use of English exercise is attached to this assignment.'}{' '}
        Changing the exam, level, or task type will clear it.
        {summary && (
          <>
            <span className="mt-1 block text-xs text-muted-foreground">
              Exercise #{summary.exerciseId}
              {summary.questionCount ? ` · ${summary.questionCount} questions` : ''}
              {summary.generatedAt ? ` · Generated ${formatGeneratedAt(summary.generatedAt)}` : ''}
            </span>
            {(summary.teacherTheme || summary.teacherSkillFocus) && (
              <span className="mt-2 block space-y-1 rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-2 text-[0.7rem] leading-relaxed text-muted-foreground">
                {summary.teacherTheme && (
                  <span>
                    <span className="font-semibold text-foreground">Theme:</span> {summary.teacherTheme}
                  </span>
                )}
                {summary.teacherSkillFocus && (
                  <span className="block">
                    <span className="font-semibold text-foreground">Skill focus:</span> {summary.teacherSkillFocus}
                  </span>
                )}
              </span>
            )}
          </>
        )}
      </>
    ),
  },
}

const mergeCopy = (copy?: TaskConfigurationCardCopy) => {
  const heading = {
    ...DEFAULT_COPY.heading,
    ...(copy?.heading ?? {}),
  }

  return {
    heading,
    placeholders: {
      ...DEFAULT_COPY.placeholders,
      ...(copy?.placeholders ?? {}),
    },
    fieldLabels: {
      ...DEFAULT_COPY.fieldLabels,
    ...(copy?.fieldLabels ?? {}),
  },
    attached: {
      ...DEFAULT_COPY.attached,
      ...(copy?.attached ?? {}),
    },
  }
}

export const TaskConfigurationCard = ({
  exams,
  levels,
  taskTypes,
  selectedTaskType,
  selectedExamId,
  onSelectExam,
  selectedLevelId,
  onSelectLevel,
  selectedTaskTypeId,
  onSelectTask,
  loading,
  attachedExerciseSummary = null,
  copy,
  className,
}: TaskConfigurationCardProps) => {
  const resolvedCopy = useMemo(() => mergeCopy(copy), [copy])

  const taskLabel = attachedExerciseSummary?.taskName || attachedExerciseSummary?.taskCode || null

  const HeadingIcon = resolvedCopy.heading.icon ?? DEFAULT_COPY.heading.icon!

  const writingTasks = useMemo(
    () => taskTypes.filter((task) => !isRuoeTaskCode(task.taskCode)),
    [taskTypes],
  )
  const ruoeTasks = useMemo(
    () => taskTypes.filter((task) => isRuoeTaskCode(task.taskCode)),
    [taskTypes],
  )

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <HeadingIcon className={resolvedCopy.heading.iconClassName ?? DEFAULT_COPY.heading.iconClassName!} />
          {resolvedCopy.heading.stepLabel ? `${resolvedCopy.heading.stepLabel} ` : ''}
          {resolvedCopy.heading.title}
        </CardTitle>
        {resolvedCopy.heading.description && <CardDescription>{resolvedCopy.heading.description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {attachedExerciseSummary && (
          <Alert className="sm:col-span-3">
            <AlertTitle>{resolvedCopy.attached.title}</AlertTitle>
            <AlertDescription className="text-sm">
              {resolvedCopy.attached.description?.({ summary: attachedExerciseSummary, taskLabel })}
            </AlertDescription>
          </Alert>
        )}
        <FilterSelect
          label={resolvedCopy.fieldLabels.exam ?? DEFAULT_COPY.fieldLabels.exam}
          value={selectedExamId}
          onValueChange={onSelectExam}
          placeholder={
            loading.exams
              ? 'Loading…'
              : exams.length === 0
                ? 'No exams available'
                : resolvedCopy.placeholders.exam
          }
          disabled={loading.exams || exams.length === 0}
        >
          {exams.map((exam) => (
            <SelectItem key={exam.id} value={String(exam.id)}>
              {exam.name}
            </SelectItem>
          ))}
        </FilterSelect>

        <FilterSelect
          label={resolvedCopy.fieldLabels.level ?? DEFAULT_COPY.fieldLabels.level}
          value={selectedLevelId}
          onValueChange={onSelectLevel}
          placeholder={
            !selectedExamId
              ? 'Select an exam first'
              : loading.levels
                ? 'Loading levels…'
                : levels.length === 0
                  ? 'No levels'
                  : resolvedCopy.placeholders.level
          }
          disabled={!selectedExamId || loading.levels || levels.length === 0}
        >
          {levels.map((level) => (
            <SelectItem key={level.id} value={String(level.id)}>
              {level.name}
              {level.code ? ` (${level.code})` : ''}
            </SelectItem>
          ))}
        </FilterSelect>

        <FilterSelect
          label={resolvedCopy.fieldLabels.taskType ?? DEFAULT_COPY.fieldLabels.taskType}
          value={selectedTaskTypeId}
          onValueChange={onSelectTask}
          placeholder={
            !selectedLevelId
              ? 'Select a level first'
              : loading.tasks
                ? 'Loading tasks…'
                : taskTypes.length === 0
                  ? 'No task types'
                  : resolvedCopy.placeholders.task
          }
          disabled={!selectedLevelId || loading.tasks || taskTypes.length === 0}
        >
          {(() => {
            return (
              <>
                {writingTasks.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Writing tasks</SelectLabel>
                    {writingTasks.map((task) => (
                      <SelectItem key={task.id} value={String(task.id)}>
                        {task.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {writingTasks.length > 0 && ruoeTasks.length > 0 && <SelectSeparator />}
                {ruoeTasks.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Reading & Use of English</SelectLabel>
                    {ruoeTasks.map((task) => (
                      <SelectItem key={task.id} value={String(task.id)}>
                        {getTaskDisplayName(task)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </>
            )
          })()}
        </FilterSelect>
        {selectedTaskType && (
          <div className="sm:col-span-3 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{getTaskDisplayName(selectedTaskType)}</p>
            {selectedTaskType.description && <p className="mt-1">{selectedTaskType.description}</p>}
            {typeof selectedTaskType.defaultTimeMinutes === 'number' && selectedTaskType.defaultTimeMinutes > 0 && (
              <p className="mt-1">Default time: {selectedTaskType.defaultTimeMinutes} minutes</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

TaskConfigurationCard.displayName = 'TaskConfigurationCard'

const FilterSelect = ({
  label,
  value,
  onValueChange,
  placeholder,
  disabled,
  children,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  children: ReactNode
}) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  </div>
)
