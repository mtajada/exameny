import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/useAuth.ts'
import type { StudentProgressSnapshot } from '@/features/student-progress/types.ts'
import { useStudentProgressSnapshot } from '@/features/student-progress/index.ts'
import {
  PerformanceTrendChart,
  ProgressSummaryCards,
  TaskPerformanceList,
  InsightsPanel,
  ExamSelector,
  WritingCriteriaTable,
  type ExamOption,
  type TrendTaskFilter,
} from '@/features/student-progress/components/index.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Button } from '@/components/ui/button.tsx'
import { BookOpenCheck } from 'lucide-react'

const QUERY_KEY = 'student-progress-dashboard'
const DATE_LOCALE = 'en-US'

const EMPTY_SNAPSHOT: Omit<StudentProgressSnapshot, 'metadata'> & {
  metadata: StudentProgressSnapshot['metadata']
} = {
  aggregates: {
    totalTasks: 0,
    writingTasks: 0,
    ruoeTasks: 0,
    avgWritingScore: null,
    avgRuoeScore: null,
    avgAiScorePercent: null,
    avgTeacherScorePercent: null,
    weeklyCompleted: 0,
    improvementTrend: 'stable',
  },
  performanceHistory: [],
  taskPerformance: [],
  writingCriteria: [],
  ruoeMistakes: [],
  insights: [],
  metadata: {
    examId: 0,
    examName: null,
    maxScore: null,
  },
  availableExams: [],
}

function ProgressPage() {
  const { user, userPreferences, activeAcademyId, isLoading: authLoading } = useAuth()
  const studentId = user?.id ?? null
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null)
  const [trendFilter, setTrendFilter] = useState<TrendTaskFilter>('all')

  const progressState = useStudentProgressSnapshot({
    studentId,
    academyId: activeAcademyId ?? null,
    examId: selectedExamId ?? null,
    enabled: Boolean(studentId && activeAcademyId != null),
    queryKey: [QUERY_KEY, studentId ?? 'anonymous', activeAcademyId ?? 'no-academy', selectedExamId ?? 'auto'],
  })

  const snapshot = progressState.snapshot ?? EMPTY_SNAPSHOT
  const availableExams = progressState.availableExams
  const summaryMetrics = snapshot.aggregates
  const performanceHistory = snapshot.performanceHistory
  const taskPerformance = snapshot.taskPerformance
  const writingCriteria = snapshot.writingCriteria
  const ruoeMistakes = snapshot.ruoeMistakes
  const insights = snapshot.insights
  const metadata = snapshot.metadata

  useEffect(() => {
    if (activeAcademyId === undefined) return

    setSelectedExamId(null)
    setTrendFilter('all')
  }, [activeAcademyId])

  useEffect(() => {
    if (progressState.loading) return
    if (!progressState.snapshot) return
    const snapshotExamId = progressState.snapshot.metadata.examId
    if (selectedExamId == null && snapshotExamId) {
      setSelectedExamId(snapshotExamId)
    }
  }, [progressState.snapshot, progressState.loading, selectedExamId])

  useEffect(() => {
    if (selectedExamId == null) return
    const stillValid = availableExams.some((option) => option.examId === selectedExamId)
    if (!stillValid) {
      setSelectedExamId(null)
      setTrendFilter('all')
    }
  }, [availableExams, selectedExamId])

  const examOptions: ExamOption[] = useMemo(
    () =>
      availableExams.map((option) => ({
        value: String(option.examId),
        label: option.examName ?? `Exam ${option.examId}`,
        maxScore: option.maxScore ?? 100,
      })),
    [availableExams],
  )

  const resolvedExamSelectorValue = selectedExamId != null ? String(selectedExamId) : examOptions[0]?.value ?? ''

  const filteredTasks = useMemo(() => {
    if (trendFilter === 'all') return taskPerformance
    return taskPerformance.filter((task) => task.taskType === trendFilter)
  }, [taskPerformance, trendFilter])

  const hasData = summaryMetrics.totalTasks > 0

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
          <p className="mt-4 text-gray-600">Preparing your workspace…</p>
        </div>
      </div>
    )
  }

  if (!studentId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <Alert className="max-w-xl">
          <AlertTitle>Sign in to view your progress</AlertTitle>
          <AlertDescription>We need your account to display exam statistics.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!activeAcademyId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <Alert className="max-w-xl">
          <AlertTitle>Select an academy to view your progress</AlertTitle>
          <AlertDescription>
            Switch back to the onboarding flow to choose an academy before reviewing your statistics.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (progressState.error) {
    const message = progressState.error ?? 'Unknown error'
      return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
          <Alert variant="destructive" className="max-w-xl">
            <AlertTitle>We could not load your progress</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{message}</p>
              <Button variant="outline" size="sm" onClick={() => progressState.refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )
  }

  const pageTitle = userPreferences?.fullName
    ? `Welcome back, ${userPreferences.fullName}!`
    : 'Progress overview'

  return (
    <div className="min-h-screen bg-muted/20 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4">
        <header className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold text-foreground">{pageTitle}</h1>
            <p className="text-sm text-muted-foreground">Review your recent results and plan your next step.</p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Exam in focus:</span>
              {metadata.examName ? (
                <span className="font-medium text-foreground">{metadata.examName}</span>
              ) : (
                <span>No exam data available</span>
              )}
            </div>
            {examOptions.length > 1 && (
              <ExamSelector
                options={examOptions}
                value={resolvedExamSelectorValue}
                onChange={(value) => {
                  setSelectedExamId(Number.parseInt(value, 10))
                  setTrendFilter('all')
                }}
              />
            )}
          </div>
        </header>

        {progressState.loading ? (
          <PageSkeleton />
        ) : hasData ? (
          <main className="space-y-8">
            <ProgressSummaryCards
              metrics={summaryMetrics}
              context="student"
              examName={metadata.examName}
            />

            <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
              <PerformanceTrendChart
                data={performanceHistory}
                filter={trendFilter}
                onFilterChange={setTrendFilter}
                context="student"
                emptyCtaHref="/select-ai-task-type"
              />
              <InsightsPanel insights={insights} context="student" />
            </section>

            <TaskPerformanceList
              tasks={filteredTasks}
              context="student"
              title="Performance by task type"
              description="Analyze your averages and choose where to focus."
            />

            {(trendFilter === 'all' || trendFilter === 'writing') && writingCriteria.length > 0 && (
              <WritingCriteriaTable
                criteriaData={writingCriteria}
                selectedExamMaxScore={metadata.maxScore ?? 5}
                title="Writing criteria analysis"
                description="Average scores by evaluation criterion."
              />
            )}

            <RuoeMistakesCard mistakes={ruoeMistakes} />
          </main>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-80 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

function EmptyState() {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl font-semibold text-foreground">Start your first practice</CardTitle>
        <p className="text-sm text-muted-foreground">
          Once you complete a Writing or R&UoE practice you will see your progress summary here.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 pb-8">
        <BookOpenCheck className="h-10 w-10 text-muted-foreground" />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/select-ai-task-type">Practice Writing</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/select-ai-task-type?type=ruoe">Practice R&UoE</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RuoeMistakesCard({ mistakes }: { mistakes: StudentProgressSnapshot['ruoeMistakes'] }) {
  if (!mistakes || mistakes.length === 0) return null

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg font-semibold text-foreground">Recent R&UoE mistakes</CardTitle>
        <p className="text-sm text-muted-foreground">Review where you slipped to reinforce upcoming attempts.</p>
      </CardHeader>
      <CardContent className="divide-y divide-border/60 p-0">
        {mistakes.slice(0, 8).map((mistake) => (
          <div key={`${mistake.attemptId}-${mistake.questionId}`} className="space-y-2 p-5 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Attempt {mistake.attemptId}</span>
              {mistake.questionOrder != null && <span>Question {mistake.questionOrder}</span>}
              <span>{new Date(mistake.completedAt).toLocaleDateString(DATE_LOCALE)}</span>
            </div>
            {mistake.questionText && <p className="font-medium text-foreground">{mistake.questionText}</p>}
            <div className="space-y-1 text-muted-foreground">
              {mistake.userAnswer && (
                <p>
                  <span className="font-medium text-foreground">Your answer: </span>
                  {mistake.userAnswer}
                </p>
              )}
              {mistake.explanation && (
                <p>
                  <span className="font-medium text-foreground">Explanation: </span>
                  {mistake.explanation}
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default ProgressPage
