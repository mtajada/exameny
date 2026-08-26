import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RuoEGeneratorPanel } from '../RuoEGeneratorPanel'

const mockReset = vi.fn()
const mockLoadExistingExercise = vi.fn()
const mockGenerateExercise = vi.fn()

const basePreviewData = {
  taskType: { name: 'R&UoE Part 1', task_code: 'B2_LANG_MC_CLOZE' },
  exercise: {
    id: 485,
    created_at: '2025-10-17T18:53:39Z',
    content_text: 'Sample content with {{GAP_1}} placeholder.',
    teacher_theme: null,
    teacher_skill_focus: null,
    title: 'R&UoE Part 1: Multiple-choice cloze',
  },
  questions: [],
}

const hookState = {
  status: 'success' as const,
  error: null,
  traceId: null as string | null,
  generatedExerciseId: 485,
  usedTheme: null as string | null,
  usedSkillFocus: null as string | null,
  previewData: basePreviewData,
  previewError: null as string | null,
  isPreviewLoading: false,
  isGenerating: false,
  progress: 100,
  generateExercise: mockGenerateExercise,
  loadExistingExercise: mockLoadExistingExercise,
  reset: mockReset,
}

vi.mock('../useRuoEExerciseGeneration', () => ({
  useRuoEExerciseGeneration: () => hookState,
}))

const mockSummary = {
  exerciseId: 485,
  taskTypeId: 999,
  examId: 101,
  levelId: 202,
  taskCode: 'B2_LANG_TRANSFORMATION',
  taskName: 'Part 4: Key word transformations',
} as const

const taskType = { id: 999, name: 'Part 4: Key word transformations', taskCode: 'B2_LANG_TRANSFORMATION' }

describe('RuoEGeneratorPanel – clearing behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hookState.previewData = basePreviewData
    hookState.generatedExerciseId = 485
    hookState.isGenerating = false
  })

  it('does not auto-reattach a cleared exercise when preview data is still cached', async () => {
    const onSelectSummary = vi.fn()
    const onClearSummary = vi.fn()

    const { rerender } = render(
      <RuoEGeneratorPanel
        examId={mockSummary.examId}
        levelId={mockSummary.levelId}
        taskType={taskType}
        disabled={false}
        selectedSummary={mockSummary}
        onSelectSummary={onSelectSummary}
        onClearSummary={onClearSummary}
        autoSelectOnPreview
        lockUiOnSelection={false}
        showPrimaryAction={false}
      />,
    )

    expect(onSelectSummary).not.toHaveBeenCalled()

    rerender(
      <RuoEGeneratorPanel
        examId={mockSummary.examId}
        levelId={mockSummary.levelId}
        taskType={taskType}
        disabled={false}
        selectedSummary={null}
        onSelectSummary={onSelectSummary}
        onClearSummary={onClearSummary}
        autoSelectOnPreview
        lockUiOnSelection={false}
        showPrimaryAction={false}
      />,
    )

    await waitFor(() => {
      expect(onSelectSummary).not.toHaveBeenCalled()
    })

    expect(mockReset).toHaveBeenCalled()
  })
})
