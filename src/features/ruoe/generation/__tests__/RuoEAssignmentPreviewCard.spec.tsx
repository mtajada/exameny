import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ExerciseData } from '@/types/ruoe'
import { RuoEAssignmentPreviewCard } from '../RuoEAssignmentPreviewCard'

const buildKeywordTransformationPreview = (): ExerciseData => ({
  exercise: {
    id: 455,
    task_type_id: 101,
    academy_id: 42,
    author_id: 'teacher-1',
    title: 'R&UoE Part 4: Key word transformations',
    content_text:
      'For questions 1-6, complete the second sentence so that it has a similar meaning to the first sentence, using the word given. Do not change the word given.',
    is_public: false,
    created_at: '2025-10-14T15:07:58.000Z',
    updated_at: '2025-10-14T15:07:58.000Z',
    teacher_theme: null,
    teacher_skill_focus: null,
  },
  questions: [
    {
      id: 9001,
      exercise_id: 455,
      order: 1,
      displayOrder: 1,
      question_text: 'FORWARD',
      correct_answers: ['KEEPING AN EYE ON'],
      explanation: null,
      original_sentence: 'Could you watch my suitcases while I go and buy my ticket?',
      transformation_sentence: 'Would you mind _______ my suitcases while I go and buy my ticket?',
    },
  ],
  options: [],
  taskType: {
    created_at: '2025-10-14T15:07:58.000Z',
    default_time_minutes: 15,
    description: 'Transform the sentence using the provided keyword.',
    exam_type_id: 21,
    id: 101,
    level_id: 3,
    name: 'C1 Use of English Part 4',
    task_code: 'C1_LANG_TRANSFORMATION',
  },
  displayOrderByQuestionId: {
    9001: 1,
  },
})

describe('RuoEAssignmentPreviewCard', () => {
  it('renders keyword transformation context when expanded', () => {
    const previewData = buildKeywordTransformationPreview()

    render(
      <RuoEAssignmentPreviewCard
        isLoading={false}
        previewData={previewData}
        error={null}
        onPrimaryAction={undefined}
        onSecondaryAction={undefined}
      />,
    )

    const toggleButton = screen.getByRole('button', { name: /show questions/i })
    fireEvent.click(toggleButton)

    const questionArticle = screen.getByRole('article')
    const originalLabel = within(questionArticle).getByText(/Original sentence:/i)
    expect(originalLabel?.parentElement?.textContent ?? '').toContain(
      'Could you watch my suitcases while I go and buy my ticket?',
    )
    within(questionArticle).getByText('Key word')
    within(questionArticle).getByText('FORWARD')
    const rewriteLabel = within(questionArticle).getByText(/Rewrite:/i)
    expect(rewriteLabel?.parentElement?.textContent ?? '').toContain(
      'Would you mind _______ my suitcases while I go and buy my ticket?',
    )
    const answerChipLabel = screen.getByText(/Correct answer:/i)
    expect(answerChipLabel?.parentElement?.textContent ?? '').toContain('KEEPING AN EYE ON')
  })

  it('hides the primary action button when primaryVisible is false', () => {
    const previewData = buildKeywordTransformationPreview()
    const noop = () => {}

    render(
      <RuoEAssignmentPreviewCard
        isLoading={false}
        previewData={previewData}
        error={null}
        onPrimaryAction={noop}
        primaryVisible={false}
        onSecondaryAction={noop}
      />,
    )

    expect(screen.queryByText(/assign this exercise/i)).toBeNull()
  })

  it('shows applied guidance block when theme or skill focus is present', () => {
    const previewData = buildKeywordTransformationPreview()

    render(
      <RuoEAssignmentPreviewCard
        isLoading={false}
        previewData={previewData}
        error={null}
        teacherTheme="Community volunteering at a local festival"
        teacherSkillFocus="Past simple vs. past continuous"
      />,
    )

    expect(screen.queryByText(/Applied guidance/i)).not.toBeNull()
    const themeLabel = screen.getByText(/Theme:/i)
    expect(themeLabel.parentElement?.textContent ?? '').toContain('Community volunteering at a local festival')
    const skillFocusLabel = screen.getByText(/Skill focus:/i)
    expect(skillFocusLabel.parentElement?.textContent ?? '').toContain('Past simple vs. past continuous')
  })

  it('renders action buttons as non-submit buttons', () => {
    const previewData = buildKeywordTransformationPreview()
    const noop = () => {}

    render(
      <RuoEAssignmentPreviewCard
        isLoading={false}
        previewData={previewData}
        error={null}
        onPrimaryAction={noop}
        onSecondaryAction={noop}
      />,
    )

    expect(screen.getByRole('button', { name: /assign this exercise/i }).getAttribute('type')).toBe('button')
    expect(screen.getByRole('button', { name: /generate new one/i }).getAttribute('type')).toBe('button')
  })
})
