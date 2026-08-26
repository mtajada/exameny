import { describe, expect, it } from 'vitest';
import {
  resolveAttemptContext,
  ensurePracticeAttempt,
  loadCompletedAttemptForReview,
  restartPracticeAttempt,
  type SupabaseClientLike,
} from '../attemptLifecycle';
import type { ExerciseData, RuoEQuestion, RuoEUserAttempt } from '@/types/ruoe';

type AnswerRow = {
  attempt_id: number;
  question_id: number;
  user_answer: string | null;
  is_correct: boolean | null;
};

interface MockData {
  attempts: RuoEUserAttempt[];
  answers: AnswerRow[];
}

interface MockClientOptions {
  activeStudentId?: string;
  onRpcCall?: (params: {
    name: string;
    args: {
      p_exercise_id: number;
      p_retry_from_attempt_id?: number | null;
    };
    attemptRows: RuoEUserAttempt[];
  }) => { data: RuoEUserAttempt | null; error: { code?: string; message?: string; details?: string | null } | null } | null;
}

const createMockSupabaseClient = (
  { attempts, answers }: MockData,
  options: MockClientOptions = {},
): SupabaseClientLike => {
  const attemptRows = [...attempts];
  const { onRpcCall, activeStudentId = 'user-1' } = options;
  let nextAttemptId = attemptRows.reduce((max, attempt) => Math.max(max, attempt.id), 0);

  type MockRestError = {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  };

  type MockSupabaseResponse = PromiseLike<{ data: unknown | null; error: MockRestError | null }>;

  type AttemptsFilterBuilder = {
    eq(column: string, value: unknown): AttemptsFilterBuilder;
    order(column: string, options?: { ascending?: boolean }): AttemptsFilterBuilder;
    limit(count: number): AttemptsFilterBuilder;
    maybeSingle(): MockSupabaseResponse;
  };

  type AttemptsQueryBuilder = {
    select(columns: string): AttemptsFilterBuilder;
  };

  type AnswersFilterBuilder = {
    eq(column: string, value: unknown): MockSupabaseResponse;
  };

  type AnswersQueryBuilder = {
    select(columns: string): AnswersFilterBuilder;
  };

  const isAttemptColumn = (column: string): column is keyof RuoEUserAttempt => {
    switch (column) {
      case 'id':
      case 'student_id':
      case 'membership_id':
      case 'exercise_id':
      case 'attempt_number':
      case 'restarted_from_attempt_id':
      case 'status':
      case 'score':
      case 'max_score':
      case 'started_at':
      case 'completed_at':
        return true;
      default:
        return false;
    }
  };

  const isAnswerColumn = (column: string): column is keyof AnswerRow => {
    switch (column) {
      case 'attempt_id':
      case 'question_id':
      case 'user_answer':
      case 'is_correct':
        return true;
      default:
        return false;
    }
  };

  function from(table: 'ruoe_user_attempts'): AttemptsQueryBuilder;
  function from(table: 'ruoe_user_answers'): AnswersQueryBuilder;
  function from(table: 'ruoe_user_attempts' | 'ruoe_user_answers') {
    if (table === 'ruoe_user_attempts') {
      const filters: Array<{ column: keyof RuoEUserAttempt; value: unknown }> = [];
      let orderSpec: { column: keyof RuoEUserAttempt; ascending: boolean } | null = null;
      let limitCount: number | null = null;

      const applyFilters = () => {
        let rows = attemptRows.filter((row) =>
          filters.every(({ column, value }) => row[column] === value),
        );

        if (orderSpec) {
          const { column, ascending } = orderSpec;
          rows = [...rows].sort((a, b) => {
            const aValue = a[column];
            const bValue = b[column];
            if (typeof aValue === 'string' && typeof bValue === 'string') {
              const aTime = Date.parse(aValue);
              const bTime = Date.parse(bValue);
              return ascending ? aTime - bTime : bTime - aTime;
            }
            return 0;
          });
        }

        if (typeof limitCount === 'number') {
          rows = rows.slice(0, limitCount);
        }

        return rows;
      };

      const filterBuilder: AttemptsFilterBuilder = {
        eq: (column, value) => {
          if (!isAttemptColumn(column)) {
            throw new Error(`Unexpected column "${column}" in mock attempts query`);
          }
          filters.push({ column, value });
          return filterBuilder;
        },
        order: (column, options) => {
          if (!isAttemptColumn(column)) {
            throw new Error(`Unexpected column "${column}" in mock attempts query`);
          }
          orderSpec = { column, ascending: options?.ascending ?? true };
          return filterBuilder;
        },
        limit: (count) => {
          limitCount = count;
          return filterBuilder;
        },
        maybeSingle: async () => {
          const rows = applyFilters();

          if (rows.length === 0) {
            return { data: null, error: { code: 'PGRST116', message: 'No rows' } };
          }
          return { data: rows[0], error: null };
        },
      };

      const queryBuilder: AttemptsQueryBuilder = {
        select: (_columns) => filterBuilder,
      };

      return queryBuilder;
    }

    const filters: Array<{ column: keyof AnswerRow; value: unknown }> = [];

    const applyFilters = () =>
      answers.filter((row) => filters.every(({ column, value }) => row[column] === value));

    const filterBuilder: AnswersFilterBuilder = {
      eq: async (column, value) => {
        if (!isAnswerColumn(column)) {
          throw new Error(`Unexpected column "${column}" in mock answers query`);
        }
        filters.push({ column, value });
        return { data: applyFilters(), error: null };
      },
    };

    const queryBuilder: AnswersQueryBuilder = {
      select: (_columns) => filterBuilder,
    };

    return queryBuilder;
  }

  const rpc = (name: string, args: Record<string, unknown>) => {
      if (name !== 'start_ruoe_attempt') {
        throw new Error(`Unexpected RPC "${name}" in mock Supabase client`);
      }

      const exerciseId =
        typeof args.p_exercise_id === 'number' && Number.isFinite(args.p_exercise_id)
          ? args.p_exercise_id
          : null;
      const retryFromAttemptId =
        typeof args.p_retry_from_attempt_id === 'number' && Number.isFinite(args.p_retry_from_attempt_id)
          ? args.p_retry_from_attempt_id
          : null;

      if (exerciseId === null) {
        throw new Error('Invalid RPC payload for start_ruoe_attempt');
      }

      const params = {
        p_exercise_id: exerciseId,
        p_retry_from_attempt_id: retryFromAttemptId ?? null,
      };

      if (onRpcCall) {
        const override = onRpcCall({ name, args: params, attemptRows });
        if (override) {
          return Promise.resolve(override);
        }
      }

      if (retryFromAttemptId !== null) {
        const sourceAttempt = attemptRows.find((row) => row.id === retryFromAttemptId) ?? null;

        if (!sourceAttempt) {
          return Promise.resolve({
            data: null,
            error: {
              code: 'P0001',
              message: `Attempt ${retryFromAttemptId} does not exist`,
            },
          });
        }

        if (sourceAttempt.student_id !== activeStudentId) {
          return Promise.resolve({
            data: null,
            error: {
              code: 'P0001',
              message: 'You can only retry your own attempts',
            },
          });
        }

        if (sourceAttempt.exercise_id !== exerciseId) {
          return Promise.resolve({
            data: null,
            error: {
              code: 'P0001',
              message: `Attempt ${retryFromAttemptId} does not belong to exercise ${exerciseId}`,
            },
          });
        }

        if (sourceAttempt.status !== 'completed') {
          return Promise.resolve({
            data: null,
            error: {
              code: 'P0001',
              message: `Attempt ${retryFromAttemptId} is not completed; finish it before starting a retry`,
            },
          });
        }
      }

      const existingInProgress = attemptRows.find(
        (row) =>
          row.student_id === activeStudentId &&
          row.exercise_id === exerciseId &&
          row.status === 'in_progress',
      );

      if (existingInProgress) {
        return Promise.resolve({
          data: null,
          error: {
            code: 'P0001',
            message: 'You already have an in-progress attempt for this exercise. Resume it before starting a new session.',
            details: `Attempt id=${existingInProgress.id} is still in progress for exercise ${exerciseId}`,
          },
        });
      }

      const previousAttempts = attemptRows.filter(
        (row) =>
          row.student_id === activeStudentId &&
          row.exercise_id === exerciseId,
      );

      const lastAttemptNumber = previousAttempts.reduce(
        (max, row) => Math.max(max, row.attempt_number),
        0,
      );

      nextAttemptId += 1;

      const newAttempt: RuoEUserAttempt = {
        id: nextAttemptId,
        student_id: activeStudentId,
        membership_id: 1,
        exercise_id: exerciseId,
        attempt_number: lastAttemptNumber + 1,
        restarted_from_attempt_id: retryFromAttemptId,
        status: 'in_progress',
        score: null,
        max_score: null,
        started_at: new Date().toISOString(),
        completed_at: null,
      };

      attemptRows.push(newAttempt);

      return Promise.resolve({
        data: newAttempt,
        error: null,
      });
  };

  return { from, rpc };
};

type QuestionFixture = Omit<RuoEQuestion, 'displayOrder'>;

const buildExerciseData = (): ExerciseData => {
  const baseQuestions: QuestionFixture[] = [
    {
      id: 201,
      exercise_id: 55,
      order: 1,
      question_text: 'Complete the sentence with the correct word.',
      correct_answers: ['increase'],
      explanation: 'Increase is the expected noun form.',
      original_sentence: null,
      transformation_sentence: null,
    },
    {
      id: 202,
      exercise_id: 55,
      order: 2,
      question_text: 'Provide a synonym.',
      correct_answers: ['expand'],
      explanation: 'Expand best matches the context.',
      original_sentence: null,
      transformation_sentence: null,
    },
  ];

  const displayOrderByQuestionId = baseQuestions.reduce<Record<number, number>>((acc, question, index) => {
    acc[question.id] = index + 1;
    return acc;
  }, {});

  return {
    exercise: {
      id: 55,
      task_type_id: 1,
      academy_id: 10,
      author_id: 'teacher-1',
      title: 'Reading & Use of English',
      content_text: 'Sample content',
      is_public: false,
      created_at: '2025-03-18T10:00:00Z',
      updated_at: '2025-03-18T10:00:00Z',
      teacher_theme: null,
      teacher_skill_focus: null,
    },
    questions: baseQuestions.map((question) => ({
      ...question,
      displayOrder: displayOrderByQuestionId[question.id],
    })),
    options: [],
    taskType: {
      id: 1,
      name: 'C1 Use of English Part 3',
      task_code: 'C1_LANG_WORD_FORMATION',
      default_time_minutes: 12,
      exam_type_id: 1,
      level_id: 1,
      created_at: '2025-03-18T09:55:00Z',
      description: 'Transform words by changing their form to fit the sentence context.',
    },
    displayOrderByQuestionId,
  };
};

describe('attempt lifecycle helpers', () => {
  it('creates the initial attempt via RPC and assigns attempt_number = 1', async () => {
    const studentId = 'student-1';
    const exerciseId = 55;

    const mockClient = createMockSupabaseClient(
      { attempts: [], answers: [] },
      { activeStudentId: studentId },
    );

    const result = await ensurePracticeAttempt({
      client: mockClient,
      exerciseId,
      studentId,
      context: { attemptId: null, attemptSource: 'none' },
    });

    expect(result.origin).toBe('created');
    expect(result.attempt.student_id).toBe(studentId);
    expect(result.attempt.exercise_id).toBe(exerciseId);
    expect(result.attempt.attempt_number).toBe(1);
    expect(result.attempt.restarted_from_attempt_id).toBeNull();
  });

  it('resumes an existing in-progress attempt when the RPC reports a conflict', async () => {
    const studentId = 'student-2';
    const exerciseId = 77;
    const conflictAttempt: RuoEUserAttempt = {
      id: 999,
      student_id: studentId,
      membership_id: 1,
      exercise_id: exerciseId,
      attempt_number: 3,
      restarted_from_attempt_id: null,
      status: 'in_progress',
      score: null,
      max_score: null,
      started_at: '2025-03-19T09:05:00Z',
      completed_at: null,
    };

    const mockClient = createMockSupabaseClient(
      { attempts: [], answers: [] },
      {
        activeStudentId: studentId,
        onRpcCall: ({ attemptRows }) => {
          attemptRows.push(conflictAttempt);
          return {
            data: null,
            error: {
              code: 'P0001',
              message: 'You already have an in-progress attempt for this exercise. Resume it before starting a new session.',
              details: `Attempt id=${conflictAttempt.id} is still in progress for exercise ${exerciseId}`,
            },
          };
        },
      },
    );

    const result = await ensurePracticeAttempt({
      client: mockClient,
      exerciseId,
      studentId,
      context: { attemptId: null, attemptSource: 'none' },
    });

    expect(result.origin).toBe('resumed');
    expect(result.attempt).toEqual(conflictAttempt);
  });

  it('hydrates a completed attempt when query params provide the attempt id', async () => {
    const studentId = 'user-1';
    const exerciseId = 55;
    const mockClient = createMockSupabaseClient({
      attempts: [
        {
          id: 101,
          student_id: studentId,
          membership_id: 1,
          exercise_id: exerciseId,
          attempt_number: 1,
          restarted_from_attempt_id: null,
          status: 'completed',
          score: 75,
          max_score: 100,
          started_at: '2025-03-19T09:00:00Z',
          completed_at: '2025-03-19T09:25:00Z',
        },
      ],
      answers: [
        { attempt_id: 101, question_id: 201, user_answer: 'increase', is_correct: true },
        { attempt_id: 101, question_id: 202, user_answer: 'reduce', is_correct: false },
      ],
    });

    const context = resolveAttemptContext({
      attemptParam: '101',
      viewParam: 'results',
      locationState: undefined,
    });

    expect(context.attemptId).toBe(101);
    expect(context.view).toBe('results');

    const ensured = await ensurePracticeAttempt({
      client: mockClient,
      exerciseId,
      studentId,
      context: {
        attemptId: context.attemptId,
        attemptSource: context.attemptSource,
      },
    });

    expect(ensured.attempt.id).toBe(101);
    expect(ensured.attempt.status).toBe('completed');

    const hydration = await loadCompletedAttemptForReview({
      client: mockClient,
      attemptId: ensured.attempt.id,
      studentId,
      exerciseData: buildExerciseData(),
    });

    expect(hydration.userAnswers).toEqual({
      201: 'increase',
      202: 'reduce',
    });
    expect(hydration.evaluationResults).toEqual({
      201: true,
      202: false,
    });
    expect(hydration.evaluationData.correctAnswers).toBe(1);
    expect(hydration.evaluationData.scorePoints).toBe(1);
    expect(hydration.evaluationData.pointsPerQuestion).toBe(1);
  });

  it('allows reviewing a completed attempt with no persisted answers', async () => {
    const mockClient = createMockSupabaseClient({
      attempts: [
        {
          id: 303,
          student_id: 'user-2',
          membership_id: 1,
          exercise_id: 55,
          attempt_number: 4,
          restarted_from_attempt_id: null,
          status: 'completed',
          score: null,
          max_score: null,
          started_at: '2025-03-20T10:00:00Z',
          completed_at: '2025-03-20T10:15:00Z',
        },
      ],
      answers: [],
    });

    const hydration = await loadCompletedAttemptForReview({
      client: mockClient,
      attemptId: 303,
      studentId: 'user-2',
      exerciseData: buildExerciseData(),
    });

    expect(hydration.userAnswers).toEqual({});
    expect(hydration.evaluationResults).toEqual({
      201: false,
      202: false,
    });
    expect(hydration.evaluationData.correctAnswers).toBe(0);
    expect(hydration.evaluationData.score).toBe(0);
    expect(hydration.evaluationData.scorePoints).toBe(0);
  });

  it('resumes an in-progress attempt when none is requested explicitly', async () => {
    const studentId = 'user-3';
    const exerciseId = 99;
    const mockClient = createMockSupabaseClient({
      attempts: [
        {
          id: 202,
          student_id: studentId,
          membership_id: 1,
          exercise_id: exerciseId,
          attempt_number: 3,
          restarted_from_attempt_id: null,
          status: 'in_progress',
          score: null,
          max_score: null,
          started_at: '2025-03-20T08:00:00Z',
          completed_at: null,
        },
      ],
      answers: [],
    });

    const context = resolveAttemptContext({
      attemptParam: null,
      viewParam: null,
      locationState: undefined,
    });

    expect(context.attemptId).toBeNull();
    expect(context.view).toBe('practice');

    const ensured = await ensurePracticeAttempt({
      client: mockClient,
      exerciseId,
      studentId,
      context: {
        attemptId: context.attemptId,
        attemptSource: context.attemptSource,
      },
    });

    expect(ensured.origin).toBe('resumed');
    expect(ensured.attempt.id).toBe(202);
    expect(ensured.attempt.status).toBe('in_progress');
  });

  it('creates a retry attempt with incremented attempt_number and lineage pointer', async () => {
    const studentId = 'retry-user';
    const exerciseId = 88;
    const firstAttempt: RuoEUserAttempt = {
      id: 401,
      student_id: studentId,
      membership_id: 1,
      exercise_id: exerciseId,
      attempt_number: 1,
      restarted_from_attempt_id: null,
      status: 'completed',
      score: 70,
      max_score: 100,
      started_at: '2025-03-18T10:00:00Z',
      completed_at: '2025-03-18T10:20:00Z',
    };

    const mockClient = createMockSupabaseClient(
      { attempts: [firstAttempt], answers: [] },
      { activeStudentId: studentId },
    );

    const result = await restartPracticeAttempt({
      client: mockClient,
      exerciseId,
      studentId,
      retryFromAttemptId: firstAttempt.id,
    });

    expect(result.origin).toBe('retry');
    expect(result.attempt.restarted_from_attempt_id).toBe(firstAttempt.id);
    expect(result.attempt.attempt_number).toBe(2);
    expect(result.attempt.status).toBe('in_progress');
  });

  it('prevents retrying attempts that belong to another student', async () => {
    const studentId = 'student-a';
    const exerciseId = 42;
    const otherAttempt: RuoEUserAttempt = {
      id: 555,
      student_id: 'student-b',
      membership_id: 1,
      exercise_id: exerciseId,
      attempt_number: 1,
      restarted_from_attempt_id: null,
      status: 'completed',
      score: 80,
      max_score: 100,
      started_at: '2025-03-16T12:00:00Z',
      completed_at: '2025-03-16T12:15:00Z',
    };

    const mockClient = createMockSupabaseClient(
      { attempts: [otherAttempt], answers: [] },
      { activeStudentId: studentId },
    );

    await expect(
      restartPracticeAttempt({
        client: mockClient,
        exerciseId,
        studentId,
        retryFromAttemptId: otherAttempt.id,
      }),
    ).rejects.toMatchObject({
      kind: 'forbidden',
      message: expect.stringMatching(/retry your own attempts/i),
    });
  });

  it('rejects retries when the source attempt is not completed', async () => {
    const studentId = 'student-c';
    const exerciseId = 51;
    const incompleteAttempt: RuoEUserAttempt = {
      id: 606,
      student_id: studentId,
      membership_id: 1,
      exercise_id: exerciseId,
      attempt_number: 1,
      restarted_from_attempt_id: null,
      status: 'in_progress',
      score: null,
      max_score: null,
      started_at: '2025-03-21T08:00:00Z',
      completed_at: null,
    };

    const mockClient = createMockSupabaseClient(
      { attempts: [incompleteAttempt], answers: [] },
      { activeStudentId: studentId },
    );

    await expect(
      restartPracticeAttempt({
        client: mockClient,
        exerciseId,
        studentId,
        retryFromAttemptId: incompleteAttempt.id,
      }),
    ).rejects.toMatchObject({
      kind: 'forbidden',
      message: expect.stringMatching(/not completed/i),
    });
  });

  it('rejects cross-exercise retry attempts', async () => {
    const studentId = 'student-d';
    const exerciseId = 300;
    const originalAttempt: RuoEUserAttempt = {
      id: 707,
      student_id: studentId,
      membership_id: 1,
      exercise_id: 999,
      attempt_number: 1,
      restarted_from_attempt_id: null,
      status: 'completed',
      score: 90,
      max_score: 100,
      started_at: '2025-03-10T09:00:00Z',
      completed_at: '2025-03-10T09:18:00Z',
    };

    const mockClient = createMockSupabaseClient(
      { attempts: [originalAttempt], answers: [] },
      { activeStudentId: studentId },
    );

    await expect(
      restartPracticeAttempt({
        client: mockClient,
        exerciseId,
        studentId,
        retryFromAttemptId: originalAttempt.id,
      }),
    ).rejects.toMatchObject({
      kind: 'forbidden',
      message: expect.stringMatching(/does not belong to exercise/i),
    });
  });

  it('propagates RPC conflict errors with guidance when a retry is blocked by an active attempt', async () => {
    const studentId = 'student-e';
    const exerciseId = 912;
    const completedAttempt: RuoEUserAttempt = {
      id: 808,
      student_id: studentId,
      membership_id: 1,
      exercise_id: exerciseId,
      attempt_number: 1,
      restarted_from_attempt_id: null,
      status: 'completed',
      score: 65,
      max_score: 100,
      started_at: '2025-03-12T11:00:00Z',
      completed_at: '2025-03-12T11:17:00Z',
    };

    const activeAttempt: RuoEUserAttempt = {
      id: 809,
      student_id: studentId,
      membership_id: 1,
      exercise_id: exerciseId,
      attempt_number: 2,
      restarted_from_attempt_id: completedAttempt.id,
      status: 'in_progress',
      score: null,
      max_score: null,
      started_at: '2025-03-12T12:00:00Z',
      completed_at: null,
    };

    const mockClient = createMockSupabaseClient(
      { attempts: [completedAttempt, activeAttempt], answers: [] },
      { activeStudentId: studentId },
    );

    await expect(
      restartPracticeAttempt({
        client: mockClient,
        exerciseId,
        studentId,
        retryFromAttemptId: completedAttempt.id,
      }),
    ).rejects.toMatchObject({
      kind: 'unknown',
      message: expect.stringMatching(/Resume attempt 809/i),
    });
  });
});
