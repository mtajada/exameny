import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, CheckCircle2, XCircle, ChevronDown } from 'lucide-react'
import { ExerciseData } from '@/types/ruoe'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, type ButtonProps } from '@/components/ui/button'
import { formatGeneratedAt } from './ruoeGenerationUtils'
import { normalizeReadingHeadings } from '@/utils/reading-format'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { buildTransformationContext } from '@/utils/ruoe-transformation'
import { getRuoELayoutKey, isReadingLayout, type RuoELayoutKey } from '@/config/ruoeFunctionMap'

interface PreviewCardProps {
  isLoading: boolean
  previewData: ExerciseData | null
  error: string | null
  onPrimaryAction?: () => void
  primaryLabel?: string
  primaryDisabled?: boolean
  onSecondaryAction?: () => void
  secondaryLabel?: string
  secondaryDisabled?: boolean
  selectionLocked?: boolean
  primaryVisible?: boolean
  teacherTheme?: string | null
  teacherSkillFocus?: string | null
}

export const RuoEAssignmentPreviewCard = ({
  isLoading,
  previewData,
  error,
  onPrimaryAction,
  primaryLabel = 'Assign this exercise',
  primaryDisabled,
  onSecondaryAction,
  secondaryLabel = 'Generate new one',
  secondaryDisabled,
  selectionLocked = false,
  primaryVisible = true,
  teacherTheme = null,
  teacherSkillFocus = null,
}: PreviewCardProps) => {
  const SecondaryIcon = selectionLocked ? XCircle : RefreshCw
  const secondaryVariant: ButtonProps['variant'] = selectionLocked ? 'ghost' : 'outline'

  const taskCode = previewData?.taskType?.task_code ?? ''
  const [questionsExpanded, setQuestionsExpanded] = useState(false)
  const layoutKey = useMemo<RuoELayoutKey | null>(() => {
    if (!taskCode) return null
    try {
      return getRuoELayoutKey(taskCode)
    } catch {
      return null
    }
  }, [taskCode])

  useEffect(() => {
    setQuestionsExpanded(false)
  }, [previewData?.exercise?.id])

  const formattedContent = useMemo(() => {
    if (!previewData?.exercise?.content_text) {
      return null
    }

    const normalized = normalizeReadingHeadings(previewData.exercise.content_text, taskCode || '')

    return normalized.replace(/\{\{GAP_(\d+)\}\}/gi, (_match, gapNumber) => {
      const parsed = Number(gapNumber)
      const label = Number.isFinite(parsed) ? parsed : gapNumber
      return `<span class="gap-preview" aria-label="Gap ${label}">Gap ${label}</span>`
    })
  }, [previewData?.exercise?.content_text, taskCode])

  const isReadingTask = useMemo(() => {
    if (layoutKey) {
      return isReadingLayout(layoutKey)
    }
    return taskCode.toUpperCase().includes('_READ_')
  }, [layoutKey, taskCode])
  const showAppliedGuidance = Boolean(
    (teacherTheme && teacherTheme.trim().length > 0) ||
    (teacherSkillFocus && teacherSkillFocus.trim().length > 0),
  )

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Preparing preview…
          </div>
          {selectionLocked && onSecondaryAction && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant={secondaryVariant}
                onClick={onSecondaryAction}
                disabled={secondaryDisabled}
              >
                <SecondaryIcon className="mr-2 h-4 w-4" />
                {secondaryLabel}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <Alert variant="destructive">
            <AlertTitle>Preview unavailable</AlertTitle>
            <AlertDescription className="mt-2 text-sm">{error}</AlertDescription>
          </Alert>
          <div className="flex justify-center gap-3">
            {onSecondaryAction && (
              <Button
                type="button"
                onClick={onSecondaryAction}
                disabled={secondaryDisabled}
                variant={secondaryVariant}
              >
                <SecondaryIcon className="mr-2 h-4 w-4" />
                {secondaryLabel}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!previewData) return null

  const generatedAt = formatGeneratedAt(previewData.exercise.created_at)
  const questionCount = previewData.questions.length
  const hasQuestions = questionCount > 0
  const hasContent = Boolean(formattedContent)
  const questionCountLabel = hasQuestions ? `${questionCount} question${questionCount === 1 ? '' : 's'}` : ''
  const questionSectionId = `ruoe-preview-questions-${previewData.exercise.id}`

  const handleToggleQuestions = () => {
    setQuestionsExpanded((prev) => !prev)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">{previewData.taskType?.name ?? 'Generated exercise'}</CardTitle>
            <CardDescription>
              Exercise #{previewData.exercise.id}
              {generatedAt ? ` • Generated ${generatedAt}` : ''}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            {onPrimaryAction && primaryVisible && (
              <Button type="button" onClick={onPrimaryAction} disabled={primaryDisabled}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> {primaryLabel}
              </Button>
            )}
            {onSecondaryAction && (
              <Button
                type="button"
                variant={secondaryVariant}
                onClick={onSecondaryAction}
                disabled={secondaryDisabled}
              >
                <SecondaryIcon className="mr-2 h-4 w-4" />
                {secondaryLabel}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {showAppliedGuidance && (
          <section className="rounded-md border border-muted-foreground/20 bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Applied guidance
            </p>
            {teacherTheme && (
              <p className="text-foreground">
                <span className="font-medium">Theme:</span> {teacherTheme}
              </p>
            )}
            {teacherSkillFocus && (
              <p className="text-foreground">
                <span className="font-medium">Skill focus:</span> {teacherSkillFocus}
              </p>
            )}
          </section>
        )}
        {hasContent && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {isReadingTask ? 'Reading passage' : 'Exercise prompt'}
            </h3>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div
                className="ruoe-preview-content prose prose-sm max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: formattedContent ?? '' }}
              />
            </div>
          </section>
        )}

        {hasQuestions && (
          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Questions</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleToggleQuestions}
                aria-expanded={questionsExpanded}
                aria-controls={questionSectionId}
                className="group h-8 gap-2 self-start rounded-full border border-transparent px-3 text-sm text-muted-foreground hover:border-muted whitespace-normal text-left sm:self-auto"
              >
                <span className="font-medium text-foreground">
                  {questionsExpanded ? 'Hide questions' : 'Show questions'}
                </span>
                {questionCountLabel && <span className="text-xs text-muted-foreground">({questionCountLabel})</span>}
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200 ease-out group-hover:text-foreground',
                    questionsExpanded ? 'rotate-180 text-foreground' : 'text-muted-foreground',
                  )}
                  aria-hidden
                />
              </Button>
            </div>
            <div
              id={questionSectionId}
              className={cn(
                'space-y-3 overflow-hidden transition-all duration-200 ease-out',
                questionsExpanded ? 'max-h-[240rem] opacity-100' : 'max-h-0 opacity-0',
              )}
              aria-hidden={!questionsExpanded}
            >
              <div className="space-y-3 pt-2">
                {previewData.questions.map((question) => (
                  <article key={question.id} className="rounded-lg border bg-background/80 p-4 shadow-sm">
                    <header className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Question {question.displayOrder}
                      </span>
                      <QuestionStem
                        displayOrder={question.displayOrder}
                        taskCode={taskCode}
                        layoutKey={layoutKey}
                        question={question}
                      />
                    </header>
                    <QuestionOptions options={previewData.options} questionId={question.id} />
                    {question.correct_answers?.length > 0 && (
                      <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                        Correct answer: <span>{question.correct_answers.join(', ')}</span>
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

type PreviewQuestion = ExerciseData['questions'][number]

const QuestionStem = ({
  displayOrder,
  taskCode,
  layoutKey,
  question,
}: {
  displayOrder: number
  taskCode?: string
  layoutKey: RuoELayoutKey | null
  question: PreviewQuestion
}) => {
  const isKeywordTransformation = layoutKey === 'ruoe-keyword-transformation'

  if (isKeywordTransformation) {
    const { originalSentence, keyWord, transformationSentence } = buildTransformationContext(question)

    return (
      <div className="space-y-2 text-sm">
        <p className="text-sm text-foreground">
          <span className="mr-2 font-medium text-muted-foreground">Original sentence:</span>
          {originalSentence}
        </p>
        <div className="inline-flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-800">
          <span>Key word</span>
          <span className="text-sm text-blue-900">{keyWord}</span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-line">
          <span className="mr-2 font-medium text-muted-foreground">Rewrite:</span>
          {transformationSentence}
        </p>
      </div>
    )
  }

  const trimmed = question.question_text?.trim()
  if (trimmed) {
    return <MarkdownPreview content={trimmed} className="text-foreground prose-p:mb-2 last:prose-p:mb-0" />
  }

  const fallbackLabel =
    layoutKey === 'ruoe-gapped-text'
      ? `Select the sentence that fits Gap ${displayOrder}.`
      : `Question ${displayOrder}`

  if (!layoutKey && taskCode) {
    const upperTaskCode = taskCode.toUpperCase()
    if (upperTaskCode.includes('READ_P6') || upperTaskCode.includes('READ_P7')) {
      return <p className="text-sm text-foreground">Select the sentence that fits Gap {displayOrder}.</p>
    }
  }

  return <p className="text-sm text-foreground">{fallbackLabel}</p>
}

const QuestionOptions = ({ options, questionId }: { options: ExerciseData['options']; questionId: number }) => {
  const relevant = options.filter((option) => option.question_id === questionId)
  if (relevant.length === 0) return null

  return (
    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
      {relevant.map((option) => (
        <li
          key={option.id}
          className={cn(
            'flex gap-2 rounded-md border border-muted px-3 py-2',
            option.is_correct ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900' : 'bg-muted/40',
          )}
        >
          <span className="font-semibold text-foreground">{option.option_letter}.</span>
          <MarkdownPreview
            content={option.option_text}
            className="flex-1 text-muted-foreground prose-p:mb-0"
          />
        </li>
      ))}
    </ul>
  )
}

const MarkdownPreview = ({ content, className }: { content: string; className?: string }) => (
  <div className={cn('prose prose-sm max-w-none', className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  </div>
)
