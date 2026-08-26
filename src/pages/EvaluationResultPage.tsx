import { useEffect, useState, type ChangeEvent } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/useAuth.ts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useToast } from '@/components/ui/use-toast.ts'
import type { Tables } from '@/integrations/supabase/types.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { format } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Input } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { Label } from '@/components/ui/label.tsx'
import MobileActionBar, { MobileActionSpacer } from '@/components/common/MobileActionBar.tsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { teacherQueryKeys } from '@/hooks/teacher/queryKeys.ts'
import { buildTimeDisplayMeta } from '@/utils/time-format.ts'
import { MistakesAnalysisCard } from '@/components/evaluation/MistakesAnalysisCard.tsx'
import {
  DEBUG_MISTAKES_PRESETS,
  type MistakesAnalysisDebugPreset,
} from '@/components/evaluation/mistakesAnalysisDebugData.ts'

const SCORE_DECIMALS = 1
const ANY_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/
const DECIMAL_PATTERN = /^\d+(?:\.\d)?$/
const SCORE_FRACTION_PATTERN = /(\d+(?:[.,]\d+)?)(\s*\/\s*)(\d+(?:[.,]\d+)?)/u

function formatScoreFractionText(raw: string, decimals = SCORE_DECIMALS): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed

  return trimmed.replace(SCORE_FRACTION_PATTERN, (match, numeratorRaw: string, separator: string, denominatorRaw: string) => {
    const numerator = Number.parseFloat(numeratorRaw.replace(',', '.'))
    const denominator = Number.parseFloat(denominatorRaw.replace(',', '.'))

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
      return match
    }

    return `${numerator.toFixed(decimals)}${separator}${denominator.toFixed(decimals)}`
  })
}

function formatScoreFraction(numerator: number, denominator: number, decimals = SCORE_DECIMALS): string {
  return `${numerator.toFixed(decimals)}/${denominator.toFixed(decimals)}`
}

function parseScoreValue(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (!normalized) return null
  if (!DECIMAL_PATTERN.test(normalized)) {
    return null
  }
  const numericValue = Number(normalized)
  return Number.isNaN(numericValue) ? null : numericValue
}

function validateScoreValue(value: string, maxScore: number | null, integerOnly: boolean): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const normalized = trimmed.replace(',', '.')
  if (!ANY_DECIMAL_PATTERN.test(normalized)) return 'Enter a valid number.'
  if (!DECIMAL_PATTERN.test(normalized)) return `Use at most ${SCORE_DECIMALS} decimal place${SCORE_DECIMALS === 1 ? '' : 's'}.`

  if (integerOnly && normalized.includes('.')) {
    return 'Score must be a whole number.'
  }

  const numericValue = Number(normalized)
  if (Number.isNaN(numericValue)) {
    return 'Enter a valid number.'
  }

  if (numericValue < 0) {
    return 'Score cannot be negative.'
  }

  if (maxScore != null && numericValue > maxScore) {
    return `Score cannot exceed ${maxScore}.`
  }

  return null
}

function extractStoredScore(raw: string | null | undefined): string {
  if (!raw) return ''
  const match = raw.match(/\d+(?:\.\d+)?/)
  return match ? match[0] : ''
}

function requiresIntegerScoring(_maxScore: number | null): boolean {
  return false
}

interface SubmissionDisplayData {
  id: string
  submissionText: string | null
  wordCount: number | null
  originalPromptText: string
  taskName: string
  createdAt?: string
  suggestedTimeMinutes?: number
  timeSpentSeconds?: number | null
  assignedPromptId?: string | null
  taskTypeId?: number | null
  examId?: number | null
  levelId?: number | null
  aiGeneratedPromptText?: string | null
}

interface Criteria {
  id: number
  name: string
  criterion_code: string
}

type CriteriaEvalItem = {
  criterion_id?: number
  criterionId?: number
  criterionName: string
  score: string
  feedback: string
  criterion_code?: string
}

type EvaluationSource = 'ai' | 'teacher'

interface CriterionComparison {
  name: string
  ai?: CriteriaEvalItem
  teacher?: CriteriaEvalItem
}

type ScoreTone = 'low' | 'medium' | 'high'

interface EvaluationDetail {
  submission: SubmissionDisplayData
  evaluation: Tables<'evaluations'>
  assignedTeacherId: string | null
  maxScore: number | null
  criteria: Criteria[]
  studentId: string
  isAuthorizedTeacher: boolean
}

interface CriteriaInputItem {
  criterionId: number
  criterionName: string
  scoreInput: string
  feedbackInput: string
}

interface TeacherFormState {
  overallScore: string
  comments: string
  criteria: CriteriaInputItem[]
  showCriteria: boolean
  error: string | null
}

const DEFAULT_TEACHER_FORM: TeacherFormState = {
  overallScore: '',
  comments: '',
  criteria: [],
  showCriteria: false,
  error: null,
}

const EvaluationResultPage = () => {
  const { submissionId } = useParams<{ submissionId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { user, role: userRole, isPlatformAdmin } = useAuth()

  const rawMockPreset = searchParams.get('mockMistakes')
  const debugMistakesPreset: MistakesAnalysisDebugPreset | null =
    import.meta.env.DEV && rawMockPreset && rawMockPreset in DEBUG_MISTAKES_PRESETS
      ? (rawMockPreset as MistakesAnalysisDebugPreset)
      : null

  const evaluationQuery = useQuery({
    queryKey: ['teacher', 'evaluation', submissionId],
    enabled: Boolean(submissionId),
    queryFn: async (): Promise<EvaluationDetail> => {
      if (!submissionId) throw new Error('Submission not found.')

      const { data, error } = await supabase
        .from('submissions')
        .select(`
          id,
          submission_text,
          word_count,
          time_spent_seconds,
          status,
          created_at,
          student_id,
          student_membership_id,
          ai_generated_prompt_text,
          assigned_prompt: assigned_prompts!left (
            id,
            prompt_text
          ),
          taskType: exam_task_types!inner (
            id,
            name,
            exam_id: exam_type_id,
            level_id: level_id,
            default_time_minutes
          ),
          evaluation: evaluations!inner (
            id,
            ai_overall_score,
            ai_criteria_evaluation,
            ai_overall_commentary,
            teacher_overall_score,
            teacher_criteria_evaluation,
            teacher_comments,
            evaluation_completed_at
          )
        `)
        .eq('id', submissionId)
        .maybeSingle()

      if (error) throw error
      if (!data || !data.evaluation || !data.taskType || !data.student_id) {
        throw new Error('Incomplete evaluation data. Please try again later.')
      }

      const studentId = data.student_id as string
      const studentMembershipIdRaw = (data as { student_membership_id?: number | string | null }).student_membership_id ?? null
      const studentMembershipId = studentMembershipIdRaw === null
        ? null
        : typeof studentMembershipIdRaw === 'number'
          ? studentMembershipIdRaw
          : Number(studentMembershipIdRaw)

      if (studentMembershipIdRaw !== null && (studentMembershipId === null || Number.isNaN(studentMembershipId))) {
        throw new Error('Submission returned an invalid student membership identifier.')
      }
      const submission: SubmissionDisplayData = {
        id: data.id,
        submissionText: data.submission_text,
        wordCount: typeof data.word_count === 'number' ? data.word_count : null,
        originalPromptText: data.ai_generated_prompt_text || data.assigned_prompt?.prompt_text || '[Prompt not available]',
        taskName: data.taskType.name || 'Unknown Task',
        createdAt: data.created_at,
        suggestedTimeMinutes: data.taskType.default_time_minutes || 0,
        timeSpentSeconds: typeof data.time_spent_seconds === 'number' ? data.time_spent_seconds : null,
        assignedPromptId: data.assigned_prompt?.id ?? null,
        taskTypeId: data.taskType.id ?? null,
        examId: data.taskType.exam_id ?? null,
        levelId: data.taskType.level_id ?? null,
        aiGeneratedPromptText: data.ai_generated_prompt_text ?? null,
      }

      let assignedTeacherId: string | null = null
      if (studentMembershipId != null) {
        const { data: studentProfile, error: studentProfileError } = await supabase
          .from('student_profiles')
          .select('assigned_teacher_id')
          .eq('membership_id', studentMembershipId)
          .maybeSingle()

        if (studentProfileError) throw studentProfileError
        assignedTeacherId = studentProfile?.assigned_teacher_id ?? null
      }

      const isAuthorizedTeacher = userRole === 'teacher' && user?.id && user.id === assignedTeacherId

      let maxScore: number | null = null
      if (data.taskType.exam_id) {
        const { data: examType, error: examTypeError } = await supabase
          .from('exam_types')
          .select('max_score')
          .eq('id', data.taskType.exam_id)
          .maybeSingle()
        if (examTypeError) throw examTypeError
        maxScore = examType?.max_score ?? null
      }

      let criteria: Criteria[] = []
      if (isAuthorizedTeacher && data.taskType.id) {
        const { data: critLinks, error: criteriaError } = await supabase
          .from('task_criteria_link')
          .select('criteria: evaluation_criteria!inner(id, name, criterion_code)')
          .eq('task_type_id', data.taskType.id)

        if (criteriaError) throw criteriaError
        criteria = (critLinks ?? [])
          .map((row) => row.criteria)
          .filter(Boolean) as Criteria[]
      }

      return {
        submission,
        evaluation: data.evaluation as Tables<'evaluations'>,
        assignedTeacherId,
        maxScore,
        criteria,
        studentId,
        isAuthorizedTeacher,
      }
    },
  })

  const [teacherForm, setTeacherForm] = useState<TeacherFormState>(DEFAULT_TEACHER_FORM)

  useEffect(() => {
    if (!evaluationQuery.data) return

    const { evaluation, criteria } = evaluationQuery.data
    const initialForm = deriveTeacherForm(evaluation, criteria)

    setTeacherForm({
      ...DEFAULT_TEACHER_FORM,
      ...initialForm,
      criteria:
        initialForm.criteria.length > 0
          ? initialForm.criteria
          : criteria.map((criterion) => ({
              criterionId: criterion.id,
              criterionName: criterion.name,
              scoreInput: '',
              feedbackInput: '',
            })),
    })
  }, [evaluationQuery.data])

  const saveMutation = useMutation({
    mutationFn: async (payload: TeacherFormState) => {
      if (!evaluationQuery.data?.evaluation || !evaluationQuery.data.evaluation.id) {
        throw new Error('Missing evaluation context. Please reload the page.')
      }
      if (evaluationQuery.data.maxScore == null) {
        throw new Error('Exam max score unavailable.')
      }

      const maxScore = evaluationQuery.data.maxScore
      const integerOnly = requiresIntegerScoring(maxScore)

      const overallScore = payload.overallScore.trim()
      const comments = payload.comments.trim()
      const criteriaActive = payload.showCriteria && payload.criteria.length > 0

      if (!overallScore && !comments && !criteriaActive) {
        throw new Error('Provide an overall score, a general comment, or per-criterion feedback before saving.')
      }

      let overallScoreValue: number | null = null
      if (overallScore) {
        const overallError = validateScoreValue(overallScore, maxScore, integerOnly)
        if (overallError) {
          throw new Error(overallError)
        }
        overallScoreValue = parseScoreValue(overallScore)
      }

      let criteriaPayload: CriteriaEvalItem[] | null = null
      if (criteriaActive) {
        const parsed: CriteriaEvalItem[] = []
        for (const criterion of payload.criteria) {
          const rawScore = criterion.scoreInput.trim()
          if (!rawScore) {
            throw new Error(`Provide a score for "${criterion.criterionName}" before saving.`)
          }

          const scoreError = validateScoreValue(rawScore, maxScore, integerOnly)
          if (scoreError) {
            throw new Error(`Scores for "${criterion.criterionName}" - ${scoreError}`)
          }
          const scoreValue = parseScoreValue(rawScore)
      if (scoreValue == null) {
            throw new Error(`Scores for "${criterion.criterionName}" - Enter a valid number.`)
          }
          parsed.push({
            criterionId: criterion.criterionId,
            criterionName: criterion.criterionName,
            score: formatScoreFraction(scoreValue, maxScore),
            feedback: criterion.feedbackInput.trim(),
            criterion_code: undefined,
          })
        }
        criteriaPayload = parsed
      }

      const updatePayload: Partial<Tables<'evaluations'>> = {
        teacher_comments: comments || null,
        teacher_overall_score: overallScoreValue !== null ? formatScoreFraction(overallScoreValue, maxScore) : null,
        teacher_criteria_evaluation: criteriaPayload,
      }

      const { error } = await supabase
        .from('evaluations')
        .update(updatePayload)
        .eq('id', evaluationQuery.data.evaluation.id)

      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Feedback saved', description: 'Your evaluation was stored successfully.' })
      void queryClient.invalidateQueries({ queryKey: ['teacher', 'evaluation', submissionId] })
      if (user?.id) {
        void queryClient.invalidateQueries({ queryKey: teacherQueryKeys.pendingReviews(user.id) })
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unable to save teacher feedback.'
      toast({ title: 'Error saving feedback', description: message, variant: 'destructive' })
      setTeacherForm((prev) => ({ ...prev, error: message }))
    },
  })

  const currentMaxScore = evaluationQuery.data?.maxScore ?? null
  const integerOnly = requiresIntegerScoring(currentMaxScore)
  const overallError = validateScoreValue(teacherForm.overallScore, currentMaxScore, integerOnly)
  const criteriaErrors = teacherForm.criteria.map((criterion) =>
    validateScoreValue(criterion.scoreInput, currentMaxScore, integerOnly),
  )

  const handleTeacherFieldChange = (field: 'overallScore' | 'comments') => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value
    setTeacherForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCriteriaInputChange = (index: number, field: 'scoreInput' | 'feedbackInput') => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value
    setTeacherForm((prev) => {
      const nextCriteria = [...prev.criteria]
      nextCriteria[index] = { ...nextCriteria[index], [field]: value }
      return { ...prev, criteria: nextCriteria }
    })
  }

  const toggleCriteriaVisibility = (show: boolean) => {
    setTeacherForm((prev) => ({ ...prev, showCriteria: show }))
  }

  const hasContent =
    Boolean(teacherForm.overallScore.trim()) ||
    Boolean(teacherForm.comments.trim()) ||
    (teacherForm.showCriteria &&
      teacherForm.criteria.some((criterion) => criterion.scoreInput.trim() || criterion.feedbackInput.trim()))

  const hasScoreErrors = Boolean(overallError) || (teacherForm.showCriteria && criteriaErrors.some(Boolean))

  const canSubmit = hasContent && !hasScoreErrors
  const saveButtonLabel = saveMutation.isPending ? 'Saving…' : 'Save Teacher Feedback'
  const saveDisabled = !canSubmit || saveMutation.isPending

  const handleSave = () => {
    if (hasScoreErrors) {
      setTeacherForm((prev) => ({ ...prev, error: 'Resolve the highlighted score errors before saving.' }))
      return
    }

    setTeacherForm((prev) => ({ ...prev, error: null }))
    saveMutation.mutate(teacherForm)
  }

  if (evaluationQuery.isPending) {
    return <EvaluationSkeleton />
  }

  if (evaluationQuery.error) {
    const message = evaluationQuery.error instanceof Error ? evaluationQuery.error.message : 'Unable to load evaluation data.'
    return (
      <div className="container mx-auto max-w-6xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { submission, evaluation, maxScore, criteria, isAuthorizedTeacher, studentId } = evaluationQuery.data!
  const isStudent = userRole === 'student'
  const isSubmissionOwner = Boolean(user?.id && user.id === studentId)
  const isAcademyAdmin = userRole === 'academy_admin'
  const canRegenerateMistakes = Boolean(isAuthorizedTeacher || isAcademyAdmin || isPlatformAdmin)

  const handlePracticeAgain = () => {
    const hasAiContext = Boolean(
      submission.aiGeneratedPromptText &&
        submission.taskTypeId != null &&
        submission.examId != null &&
        submission.levelId != null
    )

    if (hasAiContext) {
      navigate('/editor', {
        state: {
          aiGeneratedPromptText: submission.aiGeneratedPromptText,
          suggestedTimeMinutes: submission.suggestedTimeMinutes ?? 0,
          taskTypeId: submission.taskTypeId,
          examId: submission.examId,
          levelId: submission.levelId,
        },
      })
      return
    }

    if (submission.assignedPromptId) {
      navigate('/editor', {
        state: {
          assignedPromptId: submission.assignedPromptId,
        },
      })
      return
    }

    navigate('/select-ai-task-type')
  }

  const handleBackToDashboard = () => {
    navigate('/dashboard')
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-8 px-4 pt-10 pb-40">
      <HeaderSection submission={submission} evaluation={evaluation} navigate={navigate} showBackButton={!isStudent} />

      <EvaluationCard evaluation={evaluation} />
      <MistakesAnalysisCard
        submissionId={submission.id}
        debugPreset={debugMistakesPreset}
        isAuthorizedTeacher={isAuthorizedTeacher}
        canRegenerate={canRegenerateMistakes}
      />

      <PromptCard submission={submission} />

      {isStudent && (
        <StudentActions onPracticeAgain={handlePracticeAgain} onBackToDashboard={handleBackToDashboard} />
      )}

      {isAuthorizedTeacher && (
        <>
          <TeacherFeedbackCard
            teacherForm={teacherForm}
            onFieldChange={handleTeacherFieldChange}
            onCriteriaChange={handleCriteriaInputChange}
            onToggleCriteria={toggleCriteriaVisibility}
            criteria={criteria}
            maxScore={maxScore}
            integerOnly={integerOnly}
            overallError={overallError}
            criteriaErrors={criteriaErrors}
          />

          {teacherForm.error && (
            <Alert variant="destructive">
              <AlertTitle>Validation error</AlertTitle>
              <AlertDescription>{teacherForm.error}</AlertDescription>
            </Alert>
          )}

          <MobileActionBar ariaLabel="Teacher feedback actions">
            <Button size="touch" className="w-full" disabled={saveDisabled} onClick={handleSave}>
              {saveButtonLabel}
            </Button>
          </MobileActionBar>

          <MobileActionBar
            ariaLabel="Teacher feedback actions"
            display="desktop"
            className="md:px-12 md:pb-6 md:pt-4"
          >
            <div className="mx-auto w-full max-w-4xl">
              <Button size="lg" className="w-full" disabled={saveDisabled} onClick={handleSave}>
                {saveButtonLabel}
              </Button>
            </div>
          </MobileActionBar>
        </>
      )}
    </div>
  )
}

function HeaderSection({
  submission,
  evaluation,
  navigate,
  showBackButton,
}: {
  submission: SubmissionDisplayData
  evaluation: Tables<'evaluations'>
  navigate: ReturnType<typeof useNavigate>
  showBackButton: boolean
}) {
  const completedAt = evaluation.evaluation_completed_at ?? submission.createdAt ?? new Date().toISOString()
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Evaluation Summary</h1>
        <p className="text-sm text-muted-foreground">AI evaluation completed {format(new Date(completedAt), 'PPPpp', { locale: enUS })}</p>
      </div>
      {showBackButton && (
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      )}
    </div>
  )
}

function StudentActions({
  onPracticeAgain,
  onBackToDashboard,
}: {
  onPracticeAgain: () => void
  onBackToDashboard: () => void
}) {
  return (
    <>
      <div className="hidden items-center justify-center gap-4 md:flex">
        <Button size="lg" className="min-w-[11rem]" variant="outline" onClick={onBackToDashboard}>
          Back to dashboard
        </Button>
        <Button size="lg" className="min-w-[11rem]" onClick={onPracticeAgain}>
          Practice again
        </Button>
      </div>
      <MobileActionSpacer display="mobile" />
      <MobileActionBar ariaLabel="Student evaluation actions">
        <div className="flex w-full flex-col gap-2">
          <Button size="touch" className="py-4 text-base" onClick={onPracticeAgain}>
            Practice again
          </Button>
          <Button size="touch" className="py-4 text-base" variant="outline" onClick={onBackToDashboard}>
            Back to dashboard
          </Button>
        </div>
      </MobileActionBar>
    </>
  )
}

function PromptCard({ submission }: { submission: SubmissionDisplayData }) {
  const storedWordCount = typeof submission.wordCount === 'number' && submission.wordCount >= 0 ? submission.wordCount : null
  const computedWordCount = typeof submission.submissionText === 'string' ? calculateWordCount(submission.submissionText) : null

  let resolvedWordCount: number | null = null
  if (storedWordCount !== null && storedWordCount > 0) {
    resolvedWordCount = storedWordCount
  } else if (computedWordCount !== null) {
    resolvedWordCount = computedWordCount
  } else if (storedWordCount !== null) {
    resolvedWordCount = storedWordCount
  }

  const wordCountLabel =
    typeof resolvedWordCount === 'number'
      ? `${resolvedWordCount} ${resolvedWordCount === 1 ? 'word' : 'words'}`
      : 'Not available'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{submission.taskName}</CardTitle>
        <CardDescription>Original prompt provided to the student</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded border border-dashed bg-muted/40 p-4">
          <div className="prose prose-sm max-w-none dark:prose-invert [&_:where(p,li)]:text-justify">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{submission.originalPromptText}</ReactMarkdown>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Student Submission</h3>
          <div className="rounded border bg-muted/40 p-4">
            {submission.submissionText ? (
              <div className="prose prose-sm max-w-none dark:prose-invert [&_:where(p,li)]:text-justify">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{submission.submissionText}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No submission text was recorded for this evaluation.</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TimeInsightTile submission={submission} />
          <InfoTile label="Word Count" value={wordCountLabel} />
        </div>
      </CardContent>
    </Card>
  )
}

const EVALUATION_SOURCE_META: Record<EvaluationSource, { shortLabel: string; badgeClass: string; containerClass: string }> = {
  ai: {
    shortLabel: 'AI',
    badgeClass: 'border border-primary/40 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/20 dark:text-primary-foreground',
    containerClass: 'border-primary/30 bg-primary/5 dark:border-primary/40 dark:bg-primary/20',
  },
  teacher: {
    shortLabel: 'Teacher',
    badgeClass: 'border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-200',
    containerClass: 'border-amber-200 bg-amber-50 dark:border-amber-300/60 dark:bg-amber-950/20',
  },
}

function EvaluationCard({ evaluation }: { evaluation: Tables<'evaluations'> }) {
  const criteriaComparisons = buildCriterionComparisons(
    evaluation.ai_criteria_evaluation,
    evaluation.teacher_criteria_evaluation,
  )

  const aiCommentary = typeof evaluation.ai_overall_commentary === 'string' ? evaluation.ai_overall_commentary : ''
  const teacherCommentary = typeof evaluation.teacher_comments === 'string' ? evaluation.teacher_comments : ''
  const showTeacherCommentary = teacherCommentary.trim().length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evaluation</CardTitle>
        <CardDescription>Review the automated feedback alongside any teacher input.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Overall Scores</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ScoreTile
              source="ai"
              label="AI Overall Score"
              value={evaluation.ai_overall_score}
              fallback="Not available"
            />
            <ScoreTile
              source="teacher"
              label="Teacher Overall Score"
              value={evaluation.teacher_overall_score}
              fallback="Pending"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">General Commentary</h3>
          <FeedbackBlock
            source="ai"
            feedback={aiCommentary}
            emptyMessage="AI commentary not available."
          />
          {showTeacherCommentary && (
            <FeedbackBlock source="teacher" feedback={teacherCommentary} emptyMessage="" />
          )}
        </section>

        {criteriaComparisons.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Criteria Breakdown</h3>
            <CriteriaBreakdown items={criteriaComparisons} />
          </section>
        )}
      </CardContent>
    </Card>
  )
}

function ScoreTile({
  source,
  label,
  value,
  fallback,
}: {
  source: EvaluationSource
  label: string
  value?: string | null
  fallback: string
}) {
  const meta = EVALUATION_SOURCE_META[source]
  const rawValue = typeof value === 'string' ? value.trim() : ''
  const displayValue = rawValue ? formatScoreFractionText(rawValue) : fallback
  const tone = rawValue ? getScoreTone(formatScoreFractionText(rawValue)) : null
  const toneClass = tone ? SCORE_TONE_TEXT_CLASS[tone] : 'text-foreground'

  return (
    <div className={`rounded-lg border p-4 transition-colors ${meta.containerClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Badge className={`${meta.badgeClass} text-[10px] font-semibold uppercase tracking-wide`}>
          {meta.shortLabel}
        </Badge>
      </div>
      <p className={`mt-3 text-2xl font-semibold leading-tight ${toneClass}`}>{displayValue}</p>
    </div>
  )
}

function FeedbackBlock({
  source,
  score,
  feedback,
  emptyMessage,
}: {
  source: EvaluationSource
  score?: string | null
  feedback?: string | null
  emptyMessage: string
}) {
  const meta = EVALUATION_SOURCE_META[source]
  const normalizedScore = typeof score === 'string' ? score.trim() : ''
  const formattedScore = normalizedScore ? formatScoreFractionText(normalizedScore) : ''
  const normalizedFeedback = typeof feedback === 'string' ? feedback.trim() : ''
  const hasScore = formattedScore.length > 0
  const hasFeedback = normalizedFeedback.length > 0
  const tone = hasScore ? getScoreTone(formattedScore) : null
  const scoreBadgeClass = tone ? SCORE_TONE_BADGE_CLASS[tone] : 'bg-secondary text-secondary-foreground'

  return (
    <div className={`rounded-lg border p-4 transition-colors ${meta.containerClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge className={`${meta.badgeClass} text-[10px] font-semibold uppercase tracking-wide`}>
          {source === 'ai' ? 'AI feedback' : 'Teacher feedback'}
        </Badge>
        {hasScore && (
          <Badge className={`text-sm font-semibold ${scoreBadgeClass}`}>
            {formattedScore}
          </Badge>
        )}
      </div>
      {hasFeedback ? (
        <div className="prose prose-sm mt-3 max-w-none dark:prose-invert [&_:where(p,li)]:text-justify">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizedFeedback}</ReactMarkdown>
        </div>
      ) : emptyMessage ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : null}
    </div>
  )
}

function CriteriaBreakdown({ items }: { items: CriterionComparison[] }) {
  if (!items.length) {
    return null
  }

  return (
    <div className="space-y-4">
      {items.map((criterion) => {
        const key = criterion.ai?.criterionId ?? criterion.ai?.criterion_id ?? criterion.teacher?.criterionId ?? criterion.teacher?.criterion_id ?? criterion.name

        return (
          <article
            key={key}
            className="space-y-3 rounded-lg border border-border/50 bg-card/50 p-4 shadow-sm transition-colors"
          >
            <h4 className="text-base font-semibold leading-snug text-foreground">{criterion.name}</h4>
            <div className="space-y-3">
              <FeedbackBlock
                source="ai"
                score={criterion.ai?.score}
                feedback={criterion.ai?.feedback}
                emptyMessage="AI feedback not available."
              />
              {hasCriterionFeedback(criterion.teacher) && (
                <FeedbackBlock
                  source="teacher"
                  score={criterion.teacher?.score}
                  feedback={criterion.teacher?.feedback}
                  emptyMessage=""
                />
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function buildCriterionComparisons(
  aiRaw: Tables<'evaluations'>['ai_criteria_evaluation'],
  teacherRaw: Tables<'evaluations'>['teacher_criteria_evaluation'],
): CriterionComparison[] {
  const aiList = Array.isArray(aiRaw) ? (aiRaw as CriteriaEvalItem[]) : []
  const teacherList = Array.isArray(teacherRaw) ? (teacherRaw as CriteriaEvalItem[]) : []

  const order: string[] = []
  const comparisons = new Map<string, CriterionComparison>()

  const register = (item: CriteriaEvalItem, source: EvaluationSource, index: number) => {
    const key = makeCriterionKey(item, source, index)
    const existing = comparisons.get(key)
    if (existing) {
      existing[source] = item
      existing.name = selectComparisonName(existing.name, item.criterionName)
      return
    }

    const entry: CriterionComparison = {
      name: item.criterionName?.trim() || 'Unnamed criterion',
      [source]: item,
    }
    comparisons.set(key, entry)
    order.push(key)
  }

  aiList.forEach((item, index) => register(item, 'ai', index))
  teacherList.forEach((item, index) => register(item, 'teacher', index))

  return order.map((key) => comparisons.get(key)!).map((entry) => ({
    ...entry,
    name: entry.name || 'Criterion',
  }))
}

function makeCriterionKey(item: CriteriaEvalItem, source: EvaluationSource, index: number): string {
  if (typeof item.criterionId === 'number') return `id:${item.criterionId}`
  if (typeof item.criterion_id === 'number') return `id:${item.criterion_id}`
  if (item.criterion_code) return `code:${item.criterion_code.toLowerCase()}`
  if (item.criterionName) return `name:${item.criterionName.trim().toLowerCase()}`
  return `${source}:${index}`
}

function selectComparisonName(existing: string | undefined, candidate: string | undefined): string {
  const normalizedExisting = existing?.trim() ?? ''
  const normalizedCandidate = candidate?.trim() ?? ''

  if (!normalizedExisting) return normalizedCandidate || 'Criterion'
  if (!normalizedCandidate) return normalizedExisting
  return normalizedCandidate.length > normalizedExisting.length ? normalizedCandidate : normalizedExisting
}

const SCORE_TONE_TEXT_CLASS: Record<ScoreTone, string> = {
  low: 'text-destructive dark:text-red-400',
  medium: 'text-amber-600 dark:text-amber-300',
  high: 'text-emerald-600 dark:text-emerald-300',
}

const SCORE_TONE_BADGE_CLASS: Record<ScoreTone, string> = {
  low: 'border border-red-200 bg-red-100 text-red-800 dark:border-red-500/60 dark:bg-red-950/30 dark:text-red-200',
  medium:
    'border border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-400/60 dark:bg-amber-950/30 dark:text-amber-200',
  high: 'border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-950/30 dark:text-emerald-200',
}

function getScoreTone(rawValue?: string | null): ScoreTone | null {
  const { score, max } = parseScoreParts(rawValue)
  if (score == null || max == null || max <= 0) {
    return null
  }

  const ratio = score / max
  if (Number.isNaN(ratio)) return null

  if (ratio <= 0.4) return 'low'
  if (ratio < 0.7) return 'medium'
  return 'high'
}

function parseScoreParts(rawValue?: string | null): { score: number | null; max: number | null } {
  if (!rawValue) {
    return { score: null, max: null }
  }

  const match = rawValue.match(/^(\s*)(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/)
  if (!match) {
    return { score: null, max: null }
  }

  const score = Number.parseFloat(match[2])
  const max = match[3] ? Number.parseFloat(match[3]) : null

  return {
    score: Number.isNaN(score) ? null : score,
    max: max !== null && Number.isNaN(max) ? null : max,
  }
}

function hasCriterionFeedback(item?: CriteriaEvalItem): boolean {
  if (!item) return false
  const hasScore = typeof item.score === 'string' && item.score.trim().length > 0
  const hasFeedback = typeof item.feedback === 'string' && item.feedback.trim().length > 0
  return hasScore || hasFeedback
}

interface TeacherFeedbackCardProps {
  teacherForm: TeacherFormState
  onFieldChange: (field: 'overallScore' | 'comments') => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onCriteriaChange: (index: number, field: 'scoreInput' | 'feedbackInput') => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onToggleCriteria: (show: boolean) => void
  criteria: Criteria[]
  maxScore: number | null
  integerOnly: boolean
  overallError: string | null
  criteriaErrors: (string | null)[]
}

function TeacherFeedbackCard({
  teacherForm,
  onFieldChange,
  onCriteriaChange,
  onToggleCriteria,
  criteria,
  maxScore,
  integerOnly,
  overallError,
  criteriaErrors,
}: TeacherFeedbackCardProps) {
  const fallbackMax = maxScore ?? 5
  const overallPlaceholder = integerOnly
    ? `e.g. ${Math.max(Math.floor(fallbackMax - 1), 0)}`
    : `e.g. ${Math.max(fallbackMax - 0.5, 0).toFixed(SCORE_DECIMALS)}`
  const maxScoreLabel = typeof maxScore === 'number' ? maxScore.toFixed(SCORE_DECIMALS) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teacher Feedback</CardTitle>
        <CardDescription>Provide your overall score and comments. Optionally, include per-criterion feedback.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="teacher-overall-score">Overall Score {maxScoreLabel ? `(max ${maxScoreLabel})` : ''}</Label>
            <div className="max-w-xs">
              <Input
                id="teacher-overall-score"
                value={teacherForm.overallScore}
                onChange={onFieldChange('overallScore')}
                placeholder={overallPlaceholder}
                inputMode="decimal"
                className={overallError ? 'border-destructive focus-visible:ring-destructive' : undefined}
                aria-invalid={overallError ? true : undefined}
              />
            </div>
            {overallError && <p className="text-sm text-destructive">{overallError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="teacher-comments">General Comments</Label>
            <Textarea
              id="teacher-comments"
              value={teacherForm.comments}
              onChange={onFieldChange('comments')}
              rows={5}
              placeholder="Share personalised feedback for the student"
            />
          </div>
        </div>

        {criteria.length > 0 && (
          <div className="space-y-4">
            <ToggleGroup type="single" value={teacherForm.showCriteria ? 'show' : 'hide'} onValueChange={(value) => onToggleCriteria(value === 'show')}>
              <ToggleGroupItem value="hide">Hide criteria</ToggleGroupItem>
              <ToggleGroupItem value="show">Show criteria</ToggleGroupItem>
            </ToggleGroup>

            {teacherForm.showCriteria && (
              <div className="space-y-4">
                {teacherForm.criteria.map((criterion, index) => {
                  const criterionError = criteriaErrors[index] ?? null
                  return (
                    <div key={criterion.criterionId} className="rounded-md border p-4">
                      <p className="font-medium text-foreground">{criterion.criterionName}</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Score {maxScoreLabel ? `(max ${maxScoreLabel})` : ''}</Label>
                          <Input
                            value={criterion.scoreInput}
                            onChange={onCriteriaChange(index, 'scoreInput')}
                            placeholder="e.g. 3"
                            inputMode="decimal"
                            className={criterionError ? 'border-destructive focus-visible:ring-destructive' : undefined}
                            aria-invalid={criterionError ? true : undefined}
                          />
                          {criterionError && <p className="text-sm text-destructive">{criterionError}</p>}
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Feedback</Label>
                          <Textarea
                            value={criterion.feedbackInput}
                            onChange={onCriteriaChange(index, 'feedbackInput')}
                            rows={3}
                            placeholder="Specific suggestions for this criterion"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/40 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function TimeInsightTile({ submission }: { submission: SubmissionDisplayData }) {
  const meta = buildTimeDisplayMeta(submission.timeSpentSeconds, submission.suggestedTimeMinutes)

  const toneContainer: Record<'neutral' | 'positive' | 'negative', string> = {
    neutral: 'border border-border bg-muted/40 dark:bg-muted/20',
    positive: 'border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
    negative: 'border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10',
  }

  const toneActual: Record<'neutral' | 'positive' | 'negative', string> = {
    neutral: 'text-foreground',
    positive: 'text-emerald-700 dark:text-emerald-300',
    negative: 'text-rose-700 dark:text-rose-300',
  }

  const toneHelper: Record<'neutral' | 'positive' | 'negative', string> = {
    neutral: 'text-muted-foreground',
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-rose-600 dark:text-rose-400',
  }

  const goalLabel = meta.suggestedLabel === 'Not set' ? 'Goal not set' : `Goal: ${meta.suggestedLabel}`

  return (
    <div className={`rounded-md px-4 py-3 ${toneContainer[meta.tone]}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Actual Time</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className={`text-lg font-semibold ${meta.hasData ? toneActual[meta.tone] : 'text-muted-foreground'}`}>{meta.actualLabel}</span>
        <span className="text-xs text-muted-foreground">{goalLabel}</span>
      </div>
      <p className={`mt-1 text-xs ${toneHelper[meta.tone]}`}>{meta.helperText}</p>
    </div>
  )
}

function calculateWordCount(text: string | null | undefined): number {
  if (!text) return 0
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/u).filter(Boolean).length
}

function deriveTeacherForm(
  evaluation: Tables<'evaluations'>,
  criteria: Criteria[],
): Pick<TeacherFormState, 'overallScore' | 'comments' | 'criteria' | 'showCriteria'> {
  const result: Pick<TeacherFormState, 'overallScore' | 'comments' | 'criteria' | 'showCriteria'> = {
    overallScore: extractStoredScore(evaluation.teacher_overall_score),
    comments: evaluation.teacher_comments || '',
    criteria: [],
    showCriteria: false,
  }

  if (Array.isArray(evaluation.teacher_criteria_evaluation) && evaluation.teacher_criteria_evaluation.length > 0) {
    result.showCriteria = true
    const criteriaMap = new Map(criteria.map((criterion) => [criterion.id, criterion]))
    result.criteria = (evaluation.teacher_criteria_evaluation as CriteriaEvalItem[]).map((item) => ({
      criterionId: item.criterionId ?? item.criterion_id ?? 0,
      criterionName: criteriaMap.get(item.criterionId ?? item.criterion_id ?? 0)?.name ?? item.criterionName,
      scoreInput: extractStoredScore(item.score),
      feedbackInput: item.feedback,
    }))
  }

  return result
}

function EvaluationSkeleton() {
  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <Skeleton className="h-9 w-1/3 rounded" />
      <Skeleton className="h-48 w-full rounded" />
      <Skeleton className="h-72 w-full rounded" />
      <Skeleton className="h-96 w-full rounded" />
    </div>
  )
}

export default EvaluationResultPage
