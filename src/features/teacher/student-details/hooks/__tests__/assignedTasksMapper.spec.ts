import { describe, expect, it } from 'vitest'

import { mapAssignedPrompts } from '../useTeacherStudentDetails.ts'

type PartialAssignedPrompt = Parameters<typeof mapAssignedPrompts>[0][number]

describe('mapAssignedPrompts', () => {
  const basePrompt = {
    id: 'prompt-1',
    assigned_at: '2025-01-01T10:00:00Z',
    ruoe_exercise_id: null,
    task_type_id: 42,
    exam_task_types: { id: 42, task_code: 'B2_WRITE_ESSAY', name: 'Essay' },
    submissions: [],
  } as PartialAssignedPrompt

  const buildPrompt = (overrides: Partial<PartialAssignedPrompt>) => ({
    ...basePrompt,
    ...overrides,
  })

  it('keeps tasks without submissions in the pending list', () => {
    const result = mapAssignedPrompts([buildPrompt({ id: 'prompt-pending' })])

    expect(result.pending).toHaveLength(1)
    expect(result.completed).toHaveLength(0)
    expect(result.pending[0]).toMatchObject({
      id: 'prompt-pending',
      status: 'pending',
      submissionId: null,
      submittedAt: null,
    })
  })

  it('ignores draft submissions when deriving status', () => {
    const result = mapAssignedPrompts([
      buildPrompt({
        id: 'prompt-draft-only',
        submissions: [
          { id: 'sub-draft', status: 'draft', submitted_at: '2025-01-02T09:00:00Z', updated_at: '2025-01-02T09:30:00Z' },
        ],
      }),
    ])

    expect(result.pending).toHaveLength(1)
    expect(result.pending[0]).toMatchObject({ status: 'pending', submissionId: null })
  })

  it('returns evaluated submissions inside the completed list', () => {
    const result = mapAssignedPrompts([
      buildPrompt({
        id: 'prompt-evaluated',
        submissions: [
          { id: 'sub-eval', status: 'evaluated', submitted_at: '2025-01-03T12:00:00Z', updated_at: '2025-01-03T13:00:00Z' },
        ],
      }),
    ])

    expect(result.pending).toHaveLength(0)
    expect(result.completed).toHaveLength(1)
    expect(result.completed[0]).toMatchObject({
      id: 'prompt-evaluated',
      status: 'evaluated',
      submissionId: 'sub-eval',
      submittedAt: '2025-01-03T12:00:00Z',
    })
  })

  it('prefers the most recent non-draft submission when multiple exist', () => {
    const result = mapAssignedPrompts([
      buildPrompt({
        id: 'prompt-multi',
        submissions: [
          { id: 'older-eval', status: 'evaluated', submitted_at: '2025-01-01T08:00:00Z', updated_at: '2025-01-01T09:00:00Z' },
          { id: 'newer-sub', status: 'submitted', submitted_at: '2025-01-04T10:00:00Z', updated_at: '2025-01-04T10:05:00Z' },
        ],
      }),
    ])

    expect(result.completed).toHaveLength(1)
    expect(result.completed[0]).toMatchObject({
      id: 'prompt-multi',
      status: 'submitted',
      submissionId: 'newer-sub',
    })
  })
})
