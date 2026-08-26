import { describe, expect, it } from 'vitest'
import {
  buildPerformanceHistory,
  buildTaskPerformance,
  normalizeRuoeMistakes,
  type NormalizedDataBundle,
  type NormalizedRuoeAttempt,
  type NormalizedRuoeMistake,
} from '../utils.ts'

describe('student progress retry metadata propagation', () => {
  it('includes attempt metadata in performance history points for RUoE attempts', () => {
    const ruoeAttempt: NormalizedRuoeAttempt = {
      attemptId: 101,
      attemptNumber: 2,
      restartedFromAttemptId: 100,
      examId: 1,
      examName: 'C1',
      examMaxScore: 50,
      taskTypeId: 22,
      taskCode: 'C1_READ_MCQ',
      taskName: 'Reading Part 5',
      scorePercent: 82,
      maxScore: 50,
      completedAt: '2025-02-20T10:00:00.000Z',
    }

    const writingAttempt: NormalizedDataBundle['writing'][number] = {
      evaluationId: 'eval-1',
      examId: 1,
      examName: 'C1',
      examMaxScore: 50,
      taskTypeId: 55,
      taskCode: 'C1_WRITE',
      taskName: 'Essay',
      submittedAt: '2025-02-19T12:00:00.000Z',
      updatedAt: '2025-02-19T12:30:00.000Z',
      evaluationCompletedAt: '2025-02-19T12:30:00.000Z',
      aiOverallScore: '40/50',
      aiOverallCommentary: null,
      teacherOverallScore: null,
      teacherComments: null,
      timeSpentSeconds: 1800,
      defaultTimeMinutes: 45,
      aiCriteriaEvaluation: null,
    }

    const bundle: NormalizedDataBundle = {
      writing: [writingAttempt],
      ruoe: [ruoeAttempt],
      mistakes: [],
    }

    const history = buildPerformanceHistory(bundle)
    const ruoePoint = history.find((point) => point.ruoeScore !== null)

    expect(ruoePoint).toBeDefined()
    expect(ruoePoint?.attemptNumber).toBe(2)
    expect(ruoePoint?.restartedFromAttemptId).toBe(100)
    expect(history.map((point) => (point.ruoeScore !== null ? 'ruoe' : 'writing'))).toEqual([
      'writing',
      'ruoe',
    ])
  })

  it('carries attempt metadata into normalized RUoE mistakes and preserves ordering', () => {
    const mistakes: NormalizedRuoeMistake[] = [
      {
        attemptId: 201,
        attemptNumber: 3,
        restartedFromAttemptId: 199,
        examId: 1,
        exerciseId: 77,
        questionId: 8,
        questionOrder: 8,
        questionText: 'Fill the gap',
        explanation: 'Past participle required.',
        userAnswer: 'went',
        completedAt: '2025-02-21T09:00:00.000Z',
      },
      {
        attemptId: 200,
        attemptNumber: 2,
        restartedFromAttemptId: 198,
        examId: 1,
        exerciseId: 77,
        questionId: 5,
        questionOrder: 5,
        questionText: 'Choose the synonym',
        explanation: 'Collocation mismatch.',
        userAnswer: 'make',
        completedAt: '2025-02-20T08:00:00.000Z',
      },
    ]

    const normalized = normalizeRuoeMistakes(mistakes, 20)

    expect(normalized).toHaveLength(2)
    expect(normalized[0]).toMatchObject({
      attemptId: 201,
      attemptNumber: 3,
      restartedFromAttemptId: 199,
      questionId: 8,
    })
    expect(normalized[1]).toMatchObject({
      attemptId: 200,
      attemptNumber: 2,
      restartedFromAttemptId: 198,
      questionId: 5,
    })
  })

  it('aggregates RUoE task performance without double counting retries', () => {
    const ruoeAttempts: NormalizedRuoeAttempt[] = [
      {
        attemptId: 301,
        attemptNumber: 1,
        restartedFromAttemptId: null,
        examId: 2,
        examName: 'B2',
        examMaxScore: 60,
        taskTypeId: 91,
        taskCode: 'B2_LANG_WORD_FORMATION',
        taskName: 'Word Formation',
        scorePercent: 70,
        maxScore: 60,
        completedAt: '2025-02-18T09:00:00.000Z',
      },
      {
        attemptId: 302,
        attemptNumber: 2,
        restartedFromAttemptId: 301,
        examId: 2,
        examName: 'B2',
        examMaxScore: 60,
        taskTypeId: 91,
        taskCode: 'B2_LANG_WORD_FORMATION',
        taskName: 'Word Formation',
        scorePercent: 85,
        maxScore: 60,
        completedAt: '2025-02-21T09:00:00.000Z',
      },
    ]

    const bundle: NormalizedDataBundle = {
      writing: [],
      ruoe: ruoeAttempts,
      mistakes: [],
    }

    const performance = buildTaskPerformance(bundle)

    expect(performance).toHaveLength(1)
    expect(performance[0]).toMatchObject({
      taskTypeId: 91,
      taskType: 'ruoe',
      count: 2,
    })
    expect(performance[0].avgScore).toBeCloseTo((70 + 85) / 2)
  })
})
