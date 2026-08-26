export type SelectionMode = 'individual' | 'class'

export interface SelectionFilters {
  search: string
  exam: string
}

export interface RuoEAssignmentSummary {
  exerciseId: number
  taskTypeId: number
  examId: number
  levelId: number
  taskName?: string | null
  taskCode?: string | null
  title?: string | null
  questionCount?: number | null
  generatedAt?: string | null
  teacherTheme?: string | null
  teacherSkillFocus?: string | null
}

export interface AssignmentDraft {
  selectionMode: SelectionMode
  selectedClassId: string
  selectedStudentIds: string[]
  filters: SelectionFilters
  promptText: string
  aiSuggestedTime: number | null
  selectedExamId: string
  selectedLevelId: string
  selectedTaskTypeId: string
  ruoeExercise: RuoEAssignmentSummary | null
  teacherTheme?: string | null
  teacherSkillFocus?: string | null
}
