import { ExerciseData } from '@/types/ruoe'
import { RuoEAssignmentSummary } from '@/types/assignments'

// Strip only control characters while keeping full Unicode guidance intact
const CONTROL_CHAR_RANGE = '\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F'
const CONTROL_CHAR_REGEX = new RegExp(`[${CONTROL_CHAR_RANGE}]`, 'g')

export const sanitizeGuidance = (value: string) => value.replace(CONTROL_CHAR_REGEX, '')

export const formatGeneratedAt = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString()
}

export const mapExerciseDataToSummary = (
  exerciseId: number,
  context: {
    taskTypeId: number
    examId: number
    levelId: number
    taskCode?: string | null
    taskName?: string | null
    teacherTheme?: string | null
    teacherSkillFocus?: string | null
  },
  preview: ExerciseData | null,
): RuoEAssignmentSummary => ({
  exerciseId,
  taskTypeId: context.taskTypeId,
  examId: context.examId,
  levelId: context.levelId,
  taskCode: context.taskCode ?? null,
  taskName: context.taskName ?? null,
  teacherTheme: (() => {
    const persisted = preview?.exercise.teacher_theme
    if (typeof persisted === 'string') {
      const trimmed = persisted.trim()
      if (trimmed.length > 0) return trimmed
    }
    if (context.teacherTheme) {
      const trimmed = context.teacherTheme.trim()
      return trimmed.length > 0 ? trimmed : null
    }
    return null
  })(),
  teacherSkillFocus: (() => {
    const persisted = preview?.exercise.teacher_skill_focus
    if (typeof persisted === 'string') {
      const trimmed = persisted.trim()
      if (trimmed.length > 0) return trimmed
    }
    if (context.teacherSkillFocus) {
      const trimmed = context.teacherSkillFocus.trim()
      return trimmed.length > 0 ? trimmed : null
    }
    return null
  })(),
  title: preview?.exercise.title ?? null,
  questionCount: preview?.questions.length ?? null,
  generatedAt: preview?.exercise.created_at ?? null,
})
