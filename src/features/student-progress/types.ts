export interface ProgressAggregateMetrics {
  totalTasks: number
  writingTasks: number
  ruoeTasks: number
  avgWritingScore: number | null
  avgRuoeScore: number | null
  avgAiScorePercent: number | null
  avgTeacherScorePercent: number | null
  weeklyCompleted: number
  improvementTrend: 'up' | 'down' | 'stable'
}

export interface PerformanceTrendPoint {
  index: number
  date: string
  writingScore: number | null
  ruoeScore: number | null
  aiScore: number | null
  teacherScore: number | null
  attemptNumber?: number | null
  restartedFromAttemptId?: number | null
}

export interface TaskPerformanceItem {
  taskTypeId: number
  taskCode: string | null
  taskName: string
  taskType: 'writing' | 'ruoe'
  count: number
  avgScore: number | null
  maxScore: number
}

export interface ProgressInsight {
  type: 'strength' | 'improvement' | 'attention'
  message: string
  taskType?: 'writing' | 'ruoe'
}

export interface RuoeMistakeItem {
  attemptId: number
  attemptNumber: number | null
  restartedFromAttemptId: number | null
  exerciseId: number
  questionId: number
  questionOrder: number | null
  questionText: string | null
  explanation: string | null
  userAnswer: string | null
  completedAt: string
}

export interface ProgressCriteriaMetric {
  criterionName: string
  averageScore: number
  totalAttempts: number
  trend: 'up' | 'down' | 'stable'
  latestScore?: number
  maxPossibleScore: number
}

export interface StudentProgressSnapshot {
  aggregates: ProgressAggregateMetrics
  performanceHistory: PerformanceTrendPoint[]
  taskPerformance: TaskPerformanceItem[]
  writingCriteria: ProgressCriteriaMetric[]
  ruoeMistakes: RuoeMistakeItem[]
  insights: ProgressInsight[]
  metadata: {
    examId: number
    examName: string | null
    maxScore: number | null
  }
  availableExams: Array<{
    examId: number
    examName: string | null
    maxScore: number | null
  }>
}
