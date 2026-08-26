import { useCallback, useMemo, type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { PenLine } from 'lucide-react'
import TaskPromptAiGenerator from '@/components/assignment/TaskPromptAiGenerator.tsx'
import TaskPromptUploader from '@/components/assignment/TaskPromptUploader.tsx'
import { RuoEGeneratorPanel } from '@/features/ruoe/generation/RuoEGeneratorPanel.tsx'
import { isRuoeTaskCode } from '@/utils/exam-task-meta.ts'
import { ExerciseData } from '@/types/ruoe.ts'
import { RuoEAssignmentSummary } from '@/types/assignments.ts'

export interface PromptAiInsertPayload {
  value: string
  suggestedTimeMinutes?: number | null
}

interface TaskTypeMeta {
  id: number
  name: string
  taskCode: string
  description: string | null
  defaultTimeMinutes: number | null
}

interface PromptComposerHeadingCopy {
  stepLabel?: string
  writingTitle?: string
  writingDescription?: string
  ruoeTitle?: string
  ruoeDescription?: string
  icon?: React.ComponentType<{ className?: string }>
  iconClassName?: string
}

interface PromptComposerWritingCopy {
  promptLabel?: string
  promptPlaceholder?: string
  readOnlyHelperText?: string
  ruoeHelperText?: string
  editableHelperText?: string
  aiSuggestedTimeIntro?: string
}

export interface PromptComposerCardCopy {
  heading?: PromptComposerHeadingCopy
  writing?: PromptComposerWritingCopy
}

type RuoEGeneratorMode = 'default' | 'assign' | 'print'

export interface PromptComposerCardProps {
  promptText: string
  onPromptChange: (value: string) => void
  examName?: string
  examId?: number | null
  levelName?: string
  levelId?: number | null
  taskType?: TaskTypeMeta | null
  currentPrompt: string
  disabled: boolean
  onTextTranscribed: (text: string) => void
  onAiInsert: (payload: PromptAiInsertPayload) => void
  aiSuggestedTime?: number | null
  onShowToast?: (toast: { title: string; description?: string; variant?: 'default' | 'destructive'; duration?: number }) => void
  ruoeExercise?: RuoEAssignmentSummary | null
  onSelectRuoEExercise?: (summary: RuoEAssignmentSummary, preview: ExerciseData | null) => void
  onClearRuoEExercise?: () => void
  showUploader?: boolean
  showAiGenerator?: boolean
  allowManualPromptEditing?: boolean
  regenerateHint?: ReactNode
  copy?: PromptComposerCardCopy
  ruoeGeneratorMode?: RuoEGeneratorMode
  className?: string
  children?: ReactNode
}

const DEFAULT_COPY: Required<Pick<PromptComposerCardCopy, 'heading' | 'writing'>> = {
  heading: {
    stepLabel: '3.',
    writingTitle: 'Write the Prompt',
    writingDescription:
      'Compose the instructions manually, generate them with AI, or import them from an image.',
    ruoeTitle: 'Generate the Exercise',
    ruoeDescription: 'Use the dedicated Reading & Use of English generator to craft this assignment.',
    icon: PenLine,
    iconClassName: 'h-5 w-5 text-blue-600',
  },
  writing: {
    promptLabel: 'Task prompt',
    promptPlaceholder: 'Write the assignment details here…',
    readOnlyHelperText: 'This prompt is read-only. Regenerate to update the content.',
    editableHelperText: 'You can edit this prompt at any time. Regenerate with AI to start from a new suggestion.',
    ruoeHelperText: 'This assignment uses a generated R&UoE exercise. Remove it to edit the prompt manually.',
    aiSuggestedTimeIntro: 'AI suggests',
  },
}

const mergeCopy = (copy?: PromptComposerCardCopy) => ({
  heading: {
    ...DEFAULT_COPY.heading,
    ...(copy?.heading ?? {}),
  },
  writing: {
    ...DEFAULT_COPY.writing,
    ...(copy?.writing ?? {}),
  },
})

export const PromptComposerCard = ({
  promptText,
  onPromptChange,
  examName,
  examId,
  levelName,
  levelId,
  taskType,
  currentPrompt,
  disabled,
  onTextTranscribed,
  onAiInsert,
  aiSuggestedTime,
  onShowToast,
  ruoeExercise,
  onSelectRuoEExercise,
  onClearRuoEExercise,
  showUploader = true,
  showAiGenerator = true,
  allowManualPromptEditing = true,
  regenerateHint,
  copy,
  ruoeGeneratorMode = 'default',
  className,
  children,
}: PromptComposerCardProps) => {
  const resolvedCopy = useMemo(() => mergeCopy(copy), [copy])
  const ruoeGeneratorConfig = useMemo(() => {
    if (ruoeGeneratorMode === 'assign' || ruoeGeneratorMode === 'print') {
      return {
        autoSelectOnPreview: true,
        lockUiOnSelection: false,
        showPrimaryAction: false,
      }
    }
    return {
      autoSelectOnPreview: false,
      lockUiOnSelection: true,
      showPrimaryAction: true,
    }
  }, [ruoeGeneratorMode])

  const derivedTaskCode = taskType?.taskCode ?? ruoeExercise?.taskCode ?? ''
  const defaultTimeMinutes =
    typeof taskType?.defaultTimeMinutes === 'number' && Number.isFinite(taskType.defaultTimeMinutes)
      ? Math.round(taskType.defaultTimeMinutes)
      : null
  const normalizedSuggestedTime =
    typeof aiSuggestedTime === 'number' && Number.isFinite(aiSuggestedTime) ? Math.round(aiSuggestedTime) : null
  const shouldShowSuggestedTime =
    normalizedSuggestedTime !== null &&
    normalizedSuggestedTime > 0 &&
    (defaultTimeMinutes === null || normalizedSuggestedTime !== defaultTimeMinutes)
  const isRuoETask = isRuoeTaskCode(derivedTaskCode)
  const promptDisabled = disabled || Boolean(ruoeExercise) || !allowManualPromptEditing
  const taskMetaForRuoE = taskType
    ? { id: taskType.id, name: taskType.name, taskCode: taskType.taskCode }
    : null
  const HeadingIcon = resolvedCopy.heading.icon ?? DEFAULT_COPY.heading.icon

  const handleClearSummary = useCallback(() => {
    onClearRuoEExercise?.()
  }, [onClearRuoEExercise])

  const headingTitle = isRuoETask
    ? resolvedCopy.heading.ruoeTitle
    : resolvedCopy.heading.writingTitle
  const headingDescription = isRuoETask
    ? resolvedCopy.heading.ruoeDescription
    : resolvedCopy.heading.writingDescription

  const readOnlyHelperText = useMemo(() => {
    if (!promptDisabled) return null
    if (ruoeExercise) {
      return resolvedCopy.writing.ruoeHelperText
    }
    if (!allowManualPromptEditing) {
      return resolvedCopy.writing.readOnlyHelperText
    }
    return null
  }, [allowManualPromptEditing, promptDisabled, resolvedCopy.writing.readOnlyHelperText, resolvedCopy.writing.ruoeHelperText, ruoeExercise])

  const editableHelperText =
    !promptDisabled && allowManualPromptEditing ? resolvedCopy.writing.editableHelperText ?? null : null

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <HeadingIcon className={resolvedCopy.heading.iconClassName ?? DEFAULT_COPY.heading.iconClassName} />
          {resolvedCopy.heading.stepLabel ? `${resolvedCopy.heading.stepLabel} ` : ''}
          {headingTitle}
        </CardTitle>
        {headingDescription && <CardDescription>{headingDescription}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {regenerateHint && (
          <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-sm text-muted-foreground">
            {regenerateHint}
          </div>
        )}
        {isRuoETask ? (
          <RuoEGeneratorPanel
            examId={examId}
            levelId={levelId}
            taskType={taskMetaForRuoE}
            disabled={disabled}
            selectedSummary={ruoeExercise ?? null}
            autoSelectOnPreview={ruoeGeneratorConfig.autoSelectOnPreview}
            lockUiOnSelection={ruoeGeneratorConfig.lockUiOnSelection}
            showPrimaryAction={ruoeGeneratorConfig.showPrimaryAction}
            onSelectSummary={(summary, preview) => onSelectRuoEExercise?.(summary, preview)}
            onClearSummary={handleClearSummary}
          />
        ) : (
          <>
            {(showAiGenerator || showUploader) && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {showAiGenerator && (
                  <TaskPromptAiGenerator
                    examId={examId}
                    examName={examName}
                    levelId={levelId}
                    levelName={levelName}
                    taskType={taskType ?? null}
                    disabled={disabled}
                    currentPrompt={currentPrompt}
                    onInsert={onAiInsert}
                    onShowToast={onShowToast}
                  />
                )}
                {showUploader && (
                  <TaskPromptUploader
                    onTextTranscribed={onTextTranscribed}
                    disabled={promptDisabled}
                    examName={examName}
                    levelName={levelName}
                    taskTypeName={taskType?.name}
                    className="my-0 w-full sm:w-auto"
                  />
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="promptText">{resolvedCopy.writing.promptLabel}</Label>
              <Textarea
                id="promptText"
                value={promptText}
                onChange={(event) => onPromptChange(event.target.value)}
                rows={8}
                placeholder={resolvedCopy.writing.promptPlaceholder}
                disabled={promptDisabled}
              />
              {readOnlyHelperText ? (
                <p className="text-xs text-muted-foreground">{readOnlyHelperText}</p>
              ) : (
                editableHelperText && <p className="text-xs text-muted-foreground">{editableHelperText}</p>
              )}
            </div>
            {shouldShowSuggestedTime && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                {resolvedCopy.writing.aiSuggestedTimeIntro} {normalizedSuggestedTime} minutes
                {defaultTimeMinutes ? ` (default: ${defaultTimeMinutes})` : ''}.
              </div>
            )}
          </>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

PromptComposerCard.displayName = 'PromptComposerCard'
