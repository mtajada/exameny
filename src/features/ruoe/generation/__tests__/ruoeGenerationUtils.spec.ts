import { describe, expect, it } from 'vitest'
import type { ExerciseData } from '@/types/ruoe'
import { mapExerciseDataToSummary } from '../ruoeGenerationUtils'

const buildExerciseData = (overrides?: Partial<ExerciseData['exercise']>): ExerciseData => ({
  exercise: {
    id: 42,
    task_type_id: 7,
    academy_id: 3,
    author_id: 'teacher-1',
    title: 'Sample RUoE Exercise',
    content_text: 'Sample passage with {{GAP_1}}.',
    is_public: false,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    teacher_theme: null,
    teacher_skill_focus: null,
    ...overrides,
  },
  questions: [],
  options: [],
  taskType: {
    id: 7,
    task_code: 'C1_READ_MCQ',
    name: 'Reading Multiple Choice',
    description: null,
    default_time_minutes: 15,
    created_at: '2025-01-01T00:00:00.000Z',
    exam_type_id: 5,
    level_id: 2,
  },
  displayOrderByQuestionId: {},
})

describe('mapExerciseDataToSummary', () => {
  it('prefers persisted teacher guidance and trims whitespace', () => {
    const preview = buildExerciseData({
      teacher_theme: '  Persisted theme  ',
      teacher_skill_focus: 'Persisted skill ',
    })

    const summary = mapExerciseDataToSummary(
      99,
      {
        taskTypeId: 7,
        examId: 5,
        levelId: 2,
        taskCode: 'C1_READ_MCQ',
        taskName: 'Reading Multiple Choice',
        teacherTheme: 'Context theme',
        teacherSkillFocus: 'Context skill',
      },
      preview,
    )

    expect(summary.teacherTheme).toBe('Persisted theme')
    expect(summary.teacherSkillFocus).toBe('Persisted skill')
  })

  it('falls back to trimmed context values when persistence is empty', () => {
    const preview = buildExerciseData({
      teacher_theme: null,
      teacher_skill_focus: '',
    })

    const summary = mapExerciseDataToSummary(
      101,
      {
        taskTypeId: 7,
        examId: 5,
        levelId: 2,
        taskCode: 'C1_READ_MCQ',
        taskName: 'Reading Multiple Choice',
        teacherTheme: '  Context theme ',
        teacherSkillFocus: ' Context skill ',
      },
      preview,
    )

    expect(summary.teacherTheme).toBe('Context theme')
    expect(summary.teacherSkillFocus).toBe('Context skill')
  })
})
