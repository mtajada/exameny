import { parseScoreFraction, parseScorePercent } from '@/utils/score.ts'
import { countWeeklyCompletedFromData } from '@/utils/progress.ts'
import type {
  PerformanceTrendPoint,
  ProgressAggregateMetrics,
  ProgressCriteriaMetric,
  ProgressInsight,
  RuoeMistakeItem,
  StudentProgressSnapshot,
  TaskPerformanceItem,
} from '@/features/student-progress/types.ts'

export interface NormalizedWritingEvaluation {
  evaluationId: string
  examId: number | null
  examName: string | null
  examMaxScore: number | null
  taskTypeId: number | null
  taskCode: string | null
  taskName: string
  submittedAt: string | null
  updatedAt: string | null
  evaluationCompletedAt: string | null
  aiOverallScore: string | null
  aiOverallCommentary: string | null
  teacherOverallScore: string | null
  teacherComments: string | null
  timeSpentSeconds: number | null
  defaultTimeMinutes: number | null
  aiCriteriaEvaluation: Array<{ criterionName: string; score: string; feedback?: string }> | null
}

export interface NormalizedRuoeAttempt {
  attemptId: number
  attemptNumber: number | null
  restartedFromAttemptId: number | null
  examId: number | null
  examName: string | null
  examMaxScore: number | null
  taskTypeId: number | null
  taskCode: string | null
  taskName: string
  scorePercent: number | null
  maxScore: number | null
  completedAt: string | null
}

export interface NormalizedRuoeMistake {
  attemptId: number
  attemptNumber: number | null
  restartedFromAttemptId: number | null
  examId: number | null
  exerciseId: number | null
  questionId: number
  questionOrder: number | null
  questionText: string | null
  explanation: string | null
  userAnswer: string | null
  completedAt: string | null
}

export interface NormalizedDataBundle {
  writing: NormalizedWritingEvaluation[]
  ruoe: NormalizedRuoeAttempt[]
  mistakes: NormalizedRuoeMistake[]
}

type ExamMetadata = {
  examId: number
  examName: string | null
  maxScore: number | null
}

export function deriveAvailableExamOptions(bundle: NormalizedDataBundle): ExamMetadata[] {
  const map = new Map<number, ExamMetadata>()

  for (const item of bundle.writing) {
    if (item.examId != null && !map.has(item.examId)) {
      map.set(item.examId, {
        examId: item.examId,
        examName: item.examName ?? null,
        maxScore: item.examMaxScore ?? null,
      })
    }
  }

  for (const item of bundle.ruoe) {
    if (item.examId != null && !map.has(item.examId)) {
      map.set(item.examId, {
        examId: item.examId,
        examName: item.examName ?? null,
        maxScore: item.examMaxScore ?? null,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.examId - b.examId)
}

export function filterBundleByExamId(bundle: NormalizedDataBundle, examId: number | null): NormalizedDataBundle {
  if (examId == null) return bundle
  return {
    writing: bundle.writing.filter((item) => item.examId === examId),
    ruoe: bundle.ruoe.filter((item) => item.examId === examId),
    mistakes: bundle.mistakes.filter((item) => item.examId === examId),
  }
}

export function buildPerformanceHistory(bundle: NormalizedDataBundle): PerformanceTrendPoint[] {
  let sequence = 0

  const combined = [
    ...bundle.writing.map((item) => {
      sequence += 1
      const aiPercent = parseScorePercent(item.aiOverallScore)
      const teacherPercent = parseScorePercent(item.teacherOverallScore)
      const timestamp = item.evaluationCompletedAt ?? item.updatedAt ?? item.submittedAt
      const point: PerformanceTrendPoint = {
        index: 0,
        date: formatDateLabel(timestamp),
        writingScore: typeof aiPercent === 'number' ? aiPercent : null,
        ruoeScore: null,
        aiScore: typeof aiPercent === 'number' ? aiPercent : null,
        teacherScore: typeof teacherPercent === 'number' ? teacherPercent : null,
        attemptNumber: null,
        restartedFromAttemptId: null,
      }
      return {
        sequence,
        timeValue: toTimeValue(timestamp),
        point,
      }
    }),
    ...bundle.ruoe.map((item) => {
      sequence += 1
      const point: PerformanceTrendPoint = {
        index: 0,
        date: formatDateLabel(item.completedAt),
        writingScore: null,
        ruoeScore: item.scorePercent ?? null,
        aiScore: null,
        teacherScore: null,
        attemptNumber: item.attemptNumber,
        restartedFromAttemptId: item.restartedFromAttemptId,
      }
      return {
        sequence,
        timeValue: toTimeValue(item.completedAt),
        point,
      }
    }),
  ]

  return combined
    .sort((a, b) => {
      if (a.timeValue !== b.timeValue) return a.timeValue - b.timeValue
      return a.sequence - b.sequence
    })
    .map((entry, idx) => ({ ...entry.point, index: idx + 1 }))
}

export function buildTaskPerformance(bundle: NormalizedDataBundle): TaskPerformanceItem[] {
  const map = new Map<number, TaskPerformanceItem & { scoreSum: number; entries: number }>()

  for (const item of bundle.writing) {
    if (item.taskTypeId == null) continue
    const key = item.taskTypeId
    const aiPercent = parseScorePercent(item.aiOverallScore) ?? null
    if (!map.has(key)) {
      map.set(key, {
        taskTypeId: key,
        taskCode: item.taskCode ?? null,
        taskName: item.taskName,
        taskType: 'writing',
        count: 0,
        avgScore: null,
        maxScore: item.examMaxScore ?? 100,
        scoreSum: 0,
        entries: 0,
      })
    }
    const record = map.get(key)!
    record.count += 1
    if (aiPercent != null) {
      record.scoreSum += aiPercent
      record.entries += 1
    }
  }

  for (const item of bundle.ruoe) {
    if (item.taskTypeId == null) continue
    const key = item.taskTypeId
    const percent = item.scorePercent ?? null
    if (!map.has(key)) {
      map.set(key, {
        taskTypeId: key,
        taskCode: item.taskCode ?? null,
        taskName: item.taskName,
        taskType: 'ruoe',
        count: 0,
        avgScore: null,
        maxScore: item.maxScore ?? 100,
        scoreSum: 0,
        entries: 0,
      })
    }
    const record = map.get(key)!
    record.count += 1
    if (percent != null) {
      record.scoreSum += percent
      record.entries += 1
    }
  }

  return Array.from(map.values()).map(({ scoreSum, entries, ...rest }) => ({
    ...rest,
    avgScore: entries > 0 ? scoreSum / entries : null,
  }))
}

export function buildCriteriaMetrics(bundle: NormalizedDataBundle): ProgressCriteriaMetric[] {
  const criteriaMap = new Map<string, { scores: number[]; maxScore: number }>()

  for (const item of bundle.writing) {
    if (!item.aiCriteriaEvaluation) continue
    for (const crit of item.aiCriteriaEvaluation) {
      const fraction = parseScoreFraction(crit.score)
      if (!fraction) continue
      const existing = criteriaMap.get(crit.criterionName)
      if (!existing) {
        criteriaMap.set(crit.criterionName, {
          scores: [fraction.num],
          maxScore: fraction.den,
        })
      } else {
        existing.scores.push(fraction.num)
        existing.maxScore = Math.max(existing.maxScore, fraction.den)
      }
    }
  }

  const metrics: ProgressCriteriaMetric[] = []
  for (const [criterionName, data] of criteriaMap.entries()) {
    if (data.scores.length === 0) continue
    const averageScore = data.scores.reduce((sum, value) => sum + value, 0) / data.scores.length
    const latestScore = data.scores[data.scores.length - 1]
    let trend: 'up' | 'down' | 'stable' = 'stable'
    if (data.scores.length > 1) {
      const previousAverage = data.scores
        .slice(0, -1)
        .reduce((sum, value) => sum + value, 0) / (data.scores.length - 1)
      if (latestScore > previousAverage + 0.2) trend = 'up'
      else if (latestScore < previousAverage - 0.2) trend = 'down'
    }
    metrics.push({
      criterionName,
      averageScore,
      totalAttempts: data.scores.length,
      trend,
      latestScore,
      maxPossibleScore: data.maxScore,
    })
  }

  return metrics.sort((a, b) => a.criterionName.localeCompare(b.criterionName))
}

export function buildAggregates(bundle: NormalizedDataBundle, _metadata: ExamMetadata | null): ProgressAggregateMetrics {
  let writingCount = 0
  let writingScoreSum = 0
  let writingScoreEntries = 0
  let aiScoreSum = 0
  let aiScoreEntries = 0
  let teacherScoreSum = 0
  let teacherScoreEntries = 0

  for (const item of bundle.writing) {
    writingCount += 1
    const aiPercent = parseScorePercent(item.aiOverallScore)
    const teacherPercent = parseScorePercent(item.teacherOverallScore)
    if (typeof aiPercent === 'number') {
      writingScoreSum += aiPercent
      writingScoreEntries += 1
      aiScoreSum += aiPercent
      aiScoreEntries += 1
    }
    if (typeof teacherPercent === 'number') {
      teacherScoreSum += teacherPercent
      teacherScoreEntries += 1
    }
  }

  let ruoeCount = 0
  let ruoeScoreSum = 0
  let ruoeEntries = 0

  for (const item of bundle.ruoe) {
    ruoeCount += 1
    if (typeof item.scorePercent === 'number') {
      ruoeScoreSum += item.scorePercent
      ruoeEntries += 1
    }
  }

  const performanceHistory = buildPerformanceHistory(bundle)
  const improvementTrend = computeImprovementTrend(performanceHistory)

  const weeklyCompleted = countWeeklyCompletedFromData(
    bundle.writing.map((item) => ({ evaluation_completed_at: item.evaluationCompletedAt })),
    bundle.ruoe.map((item) => ({ completed_at: item.completedAt })),
  )

  return {
    totalTasks: writingCount + ruoeCount,
    writingTasks: writingCount,
    ruoeTasks: ruoeCount,
    avgWritingScore: writingScoreEntries > 0 ? writingScoreSum / writingScoreEntries : null,
    avgRuoeScore: ruoeEntries > 0 ? ruoeScoreSum / ruoeEntries : null,
    avgAiScorePercent: aiScoreEntries > 0 ? aiScoreSum / aiScoreEntries : null,
    avgTeacherScorePercent: teacherScoreEntries > 0 ? teacherScoreSum / teacherScoreEntries : null,
    weeklyCompleted,
    improvementTrend,
  }
}

export function buildInsights(aggregates: ProgressAggregateMetrics): ProgressInsight[] {
  const insights: ProgressInsight[] = []

  if (aggregates.avgWritingScore != null && aggregates.avgWritingScore >= 80) {
    insights.push({ type: 'strength', message: 'Writing performance is consistently high.', taskType: 'writing' })
  }

  if (aggregates.avgRuoeScore != null && aggregates.avgRuoeScore >= 80) {
    insights.push({ type: 'strength', message: 'R&UoE accuracy is above expectations.', taskType: 'ruoe' })
  }

  if (aggregates.avgWritingScore != null && aggregates.avgWritingScore < 60) {
    insights.push({ type: 'improvement', message: 'Writing scores show room for improvement.', taskType: 'writing' })
  }

  if (aggregates.avgRuoeScore != null && aggregates.avgRuoeScore < 60) {
    insights.push({ type: 'improvement', message: 'Focus on grammar and vocabulary to boost R&UoE results.', taskType: 'ruoe' })
  }

  if (aggregates.weeklyCompleted === 0) {
    insights.push({ type: 'attention', message: 'No practice completed during the last 7 days.' })
  }

  return insights
}

export function normalizeRuoeMistakes(mistakes: NormalizedRuoeMistake[], limit = 20): RuoeMistakeItem[] {
  return mistakes
    .filter((item) => item.completedAt)
    .sort((a, b) => {
      const ta = a.completedAt ? Date.parse(a.completedAt) : 0
      const tb = b.completedAt ? Date.parse(b.completedAt) : 0
      return tb - ta
    })
    .slice(0, limit)
    .map((item) => ({
      attemptId: item.attemptId,
      attemptNumber: item.attemptNumber,
      restartedFromAttemptId: item.restartedFromAttemptId,
      exerciseId: item.exerciseId ?? 0,
      questionId: item.questionId,
      questionOrder: item.questionOrder,
      questionText: item.questionText,
      explanation: item.explanation,
      userAnswer: item.userAnswer,
      completedAt: item.completedAt ?? new Date().toISOString(),
    }))
}

export function resolveExamMetadata(
  bundle: NormalizedDataBundle,
  preferredExamId: number | null,
  fallbackMetadata: ExamMetadata | null,
): ExamMetadata | null {
  if (preferredExamId != null) {
    const fromWriting = bundle.writing.find((item) => item.examId === preferredExamId)
    if (fromWriting) {
      return {
        examId: preferredExamId,
        examName: fromWriting.examName ?? fallbackMetadata?.examName ?? null,
        maxScore: fromWriting.examMaxScore ?? fallbackMetadata?.maxScore ?? null,
      }
    }
    const fromRuoe = bundle.ruoe.find((item) => item.examId === preferredExamId)
    if (fromRuoe) {
      return {
        examId: preferredExamId,
        examName: fromRuoe.examName ?? fallbackMetadata?.examName ?? null,
        maxScore: fromRuoe.examMaxScore ?? fallbackMetadata?.maxScore ?? null,
      }
    }
  }

  if (fallbackMetadata) return fallbackMetadata

  const firstWriting = bundle.writing.find((item) => item.examId != null)
  if (firstWriting && firstWriting.examId != null) {
    return {
      examId: firstWriting.examId,
      examName: firstWriting.examName ?? null,
      maxScore: firstWriting.examMaxScore ?? null,
    }
  }

  const firstRuoe = bundle.ruoe.find((item) => item.examId != null)
  if (firstRuoe && firstRuoe.examId != null) {
    return {
      examId: firstRuoe.examId,
      examName: firstRuoe.examName ?? null,
      maxScore: firstRuoe.examMaxScore ?? null,
    }
  }

  return null
}

export function enrichSnapshot(
  bundle: NormalizedDataBundle,
  examMetadata: ExamMetadata | null,
  availableExams: StudentProgressSnapshot['availableExams'],
): Pick<StudentProgressSnapshot, 'performanceHistory' | 'taskPerformance' | 'writingCriteria' | 'ruoeMistakes' | 'insights'> & {
  aggregates: ProgressAggregateMetrics
  availableExams: StudentProgressSnapshot['availableExams']
} {
  const aggregates = buildAggregates(bundle, examMetadata)
  const performanceHistory = buildPerformanceHistory(bundle)
  const taskPerformance = buildTaskPerformance(bundle)
  const writingCriteria = buildCriteriaMetrics(bundle)
  const ruoeMistakes = normalizeRuoeMistakes(bundle.mistakes)
  const insights = buildInsights(aggregates)

  return {
    aggregates,
    performanceHistory,
    taskPerformance,
    writingCriteria,
    ruoeMistakes,
    insights,
    availableExams,
  }
}

function formatDateLabel(timestamp: string | null | undefined): string {
  if (!timestamp) return 'No date'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'No date'
  return date.toLocaleDateString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function toTimeValue(timestamp: string | null | undefined): number {
  if (!timestamp) return 0
  const value = Date.parse(timestamp)
  return Number.isNaN(value) ? 0 : value
}

function computeImprovementTrend(points: PerformanceTrendPoint[]): 'up' | 'down' | 'stable' {
  if (points.length < 4) return 'stable'
  const recent = points.slice(-3)
  const previous = points.slice(0, -3)

  const recentAvg = averageScores(recent)
  const previousAvg = averageScores(previous)

  if (recentAvg == null || previousAvg == null) return 'stable'
  if (recentAvg > previousAvg + 2) return 'up'
  if (recentAvg < previousAvg - 2) return 'down'
  return 'stable'
}

function averageScores(points: PerformanceTrendPoint[]): number | null {
  if (points.length === 0) return null
  const scores: number[] = []
  for (const point of points) {
    if (typeof point.writingScore === 'number') scores.push(point.writingScore)
    if (typeof point.ruoeScore === 'number') scores.push(point.ruoeScore)
  }
  if (scores.length === 0) return null
  return scores.reduce((sum, value) => sum + value, 0) / scores.length
}
