export type PrintableOrientation = 'portrait' | 'landscape'
export type PrintablePageRole = 'student' | 'answer-key'

export interface PrintableDocumentMetadata {
  examName: string
  taskCode: string
  taskName?: string | null
  generatedAt: string | null
  suggestedTime?: number | null
}

export interface PrintableDocumentSettings {
  includeAnswerKeyByDefault: boolean
}

export interface PrintableDocument {
  metadata: PrintableDocumentMetadata
  settings: PrintableDocumentSettings
  pages: PrintablePage[]
}

export interface PrintablePage {
  id: string
  role: PrintablePageRole
  orientation: PrintableOrientation
  title?: string
  sections: PrintableSection[]
}

export type PrintableSection =
  | PrintableTextSection
  | PrintablePassageSection
  | PrintableQuestionSection
  | PrintableOptionsSection
  | PrintableTableSection
  | PrintableMultipleTextsSection
  | PrintableSpacerSection
  | PrintablePageBreakSection

export interface PrintableTextSection {
  type: 'text'
  heading?: string
  paragraphs: PrintableParagraph[]
  style?: 'default' | 'instructions'
}

export interface PrintablePassageSection {
  type: 'passage'
  heading?: string
  paragraphs: PrintableParagraph[]
  highlightGaps?: boolean
}

export interface PrintableParagraph {
  text: string
  emphasis?: boolean
  format?: 'plain' | 'markdown'
}

export interface PrintableQuestionSection {
  type: 'questions'
  heading?: string
  instructions?: string
  layout?: 'single-column' | 'two-column'
  questions: PrintableQuestion[]
  variant?: 'default' | 'solution'
}

export interface PrintableQuestion {
  number: number
  prompt: string
  options?: PrintableQuestionOption[]
  keyWord?: string | null
  originalSentence?: string | null
  transformationSentence?: string | null
  responseLabel?: string | null
  responseVariant?: 'single-line' | 'multi-line'
  answer?: string | string[]
  explanation?: string | null
  answerLabel?: string | null
}

export interface PrintableQuestionOption {
  label: string
  text: string
  isCorrect?: boolean
}

export interface PrintableOptionsSection {
  type: 'options'
  heading?: string
  columns?: number
  note?: string
  items: PrintableOptionItem[]
}

export interface PrintableOptionItem {
  label: string
  text: string
  isDistractor?: boolean
}

export interface PrintableTableSection {
  type: 'table'
  heading?: string
  columns: PrintableTableColumn[]
  rows: PrintableTableRow[]
  caption?: string
  variant?: 'response' | 'answer-key'
}

export interface PrintableTableColumn {
  id: string
  label: string
  align?: 'left' | 'center' | 'right'
  width?: string
}

export interface PrintableTableRow {
  cells: PrintableTableCell[]
}

export interface PrintableTableCell {
  value: string
  emphasis?: boolean
}

export interface PrintableMultipleTextsSection {
  type: 'multi-text'
  heading?: string
  texts: PrintableSubText[]
}

export interface PrintableSubText {
  label: string
  title?: string | null
  paragraphs: PrintableParagraph[]
}

export interface PrintableSpacerSection {
  type: 'spacer'
  size: 'sm' | 'md'
}

export interface PrintablePageBreakSection {
  type: 'page-break'
}

export interface BuildWritingDocumentParams {
  metadata: PrintableDocumentMetadata
  prompt: string
  suggestedTime?: number | null
}

export interface BuildRuoEDocumentParams {
  metadata: PrintableDocumentMetadata
  summary: {
    questionCount?: number | null
    title?: string | null
    taskCode?: string | null
    teacherTheme?: string | null
    teacherSkillFocus?: string | null
  }
  exerciseData: ExerciseDataShape
}

export interface ExerciseDataShape {
  exercise: {
    id: number
    title: string | null
    content_text: string | null
    created_at: string | null
    teacher_theme: string | null
    teacher_skill_focus: string | null
  }
  questions: Array<{
    id: number
    exercise_id: number
    order: number
    question_text: string | null
    correct_answers: string[]
    explanation: string | null
    original_sentence?: string | null
    transformation_sentence?: string | null
  }>
  options: Array<{
    id: number
    question_id: number
    option_letter: string
    option_text: string
    is_correct: boolean
  }>
  taskType: {
    id: number
    name: string | null
    task_code: string | null
    description: string | null
  }
  displayOrderByQuestionId: Record<number, number>
}
