import { describe, expect, it } from 'vitest'
import { mapSubmissions } from '../useTeacherStudentDetails.ts'

type SubmissionRow = Parameters<typeof mapSubmissions>[0][number]

const baseExamTask = {
  id: 1,
  task_code: 'TASK_CODE',
  name: 'Part 1: Essay',
  default_time_minutes: 40,
} as const

const baseEvaluation = {
  ai_overall_score: '75',
  ai_overall_commentary: 'Solid work',
  teacher_overall_score: null,
  teacher_comments: null,
  evaluation_completed_at: '2024-01-01T00:00:00.000Z',
} as const

describe('mapSubmissions', () => {
  const baseRow: SubmissionRow = {
    id: 'submission-1',
    status: 'evaluated',
    submitted_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z',
    task_type_id: 1,
    time_spent_seconds: 1200,
    assigned_prompt_id: null,
    ai_generated_prompt_text: 'Prompt text',
    exam_task_types: { ...baseExamTask },
    evaluations: { ...baseEvaluation },
  }

  it('groups homework pending submissions correctly', () => {
    const rows: SubmissionRow[] = [
      {
        ...baseRow,
        id: 'homework-pending',
        assigned_prompt_id: 'prompt-1',
        ai_generated_prompt_text: null,
      },
    ]

    const result = mapSubmissions(rows)

    expect(result.homeworkPending).toHaveLength(1)
    expect(result.homeworkPending[0]).toMatchObject({
      submissionId: 'homework-pending',
      origin: 'assigned',
      status: 'pending_teacher_review',
    })
    expect(result.selfPractice.pending).toHaveLength(0)
    expect(result.homeworkReviewed).toHaveLength(0)
  })

  it('groups homework reviewed submissions correctly', () => {
    const rows: SubmissionRow[] = [
      {
        ...baseRow,
        id: 'homework-reviewed',
        assigned_prompt_id: 'prompt-1',
        ai_generated_prompt_text: null,
        evaluations: {
          ...baseEvaluation,
          teacher_comments: 'Great structure',
          teacher_overall_score: '85',
        },
      },
    ]

    const result = mapSubmissions(rows)

    expect(result.homeworkReviewed).toHaveLength(1)
    expect(result.homeworkReviewed[0]).toMatchObject({
      submissionId: 'homework-reviewed',
      origin: 'assigned',
      status: 'teacher_reviewed',
    })
  })

  it('keeps homework submissions pending AI evaluation visible', () => {
    const rows: SubmissionRow[] = [
      {
        ...baseRow,
        id: 'homework-pending-ai',
        status: 'submitted',
        assigned_prompt_id: 'prompt-1',
        ai_generated_prompt_text: null,
        evaluations: null,
      },
    ]

    const result = mapSubmissions(rows)

    expect(result.homeworkPending).toHaveLength(1)
    expect(result.homeworkPending[0]).toMatchObject({
      submissionId: 'homework-pending-ai',
      origin: 'assigned',
      status: 'pending_ai_evaluation',
    })
  })

  it('groups self-practice submissions separately', () => {
    const rows: SubmissionRow[] = [
      {
        ...baseRow,
        id: 'self-pending',
        assigned_prompt_id: null,
        ai_generated_prompt_text: 'Prompt text',
      },
      {
        ...baseRow,
        id: 'self-reviewed',
        assigned_prompt_id: null,
        ai_generated_prompt_text: 'Prompt text',
        evaluations: {
          ...baseEvaluation,
          teacher_comments: 'Optional feedback provided',
          teacher_overall_score: '80',
        },
      },
    ]

    const result = mapSubmissions(rows)

    expect(result.selfPractice.pending).toHaveLength(1)
    expect(result.selfPractice.reviewed).toHaveLength(1)
    expect(result.selfPractice.pending[0]).toMatchObject({
      submissionId: 'self-pending',
      origin: 'self_practice',
    })
    expect(result.selfPractice.reviewed[0]).toMatchObject({
      submissionId: 'self-reviewed',
      origin: 'self_practice',
      status: 'teacher_reviewed',
    })
    expect(result.homeworkPending).toHaveLength(0)
    expect(result.homeworkReviewed).toHaveLength(0)
  })

  it('keeps self-practice submissions pending AI evaluation visible', () => {
    const rows: SubmissionRow[] = [
      {
        ...baseRow,
        id: 'self-pending-ai',
        status: 'submitted',
        assigned_prompt_id: null,
        ai_generated_prompt_text: 'Prompt text',
        evaluations: null,
      },
    ]

    const result = mapSubmissions(rows)

    expect(result.selfPractice.pending).toHaveLength(1)
    expect(result.selfPractice.pending[0]).toMatchObject({
      submissionId: 'self-pending-ai',
      origin: 'self_practice',
      status: 'pending_ai_evaluation',
    })
  })
})
