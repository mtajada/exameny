import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SupabaseResponse = {
  data: unknown;
  error: { message: string } | null;
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

// Hoist shared helpers so mocked modules can reference them safely.
const { createDeferred, pendingRequests, createExerciseRecord } = vi.hoisted(() => {
  const createDeferredInner = <T,>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  const pendingRequestsInner: Deferred<SupabaseResponse>[] = [];

  const createExerciseRecordInner = (id: number) => ({
    id,
    task_type_id: 101,
    academy_id: 200,
    author_id: 'author-1',
    title: `Exercise ${id}`,
    content_text: `Content ${id}`,
    is_public: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ruoe_questions: [
      {
        id: id * 10,
        exercise_id: id,
        order: 1,
        question_text: `Question ${id}`,
        correct_answers: ['A'],
        explanation: null,
        original_sentence: null,
        transformation_sentence: null,
        ruoe_options: [
          {
            id: id * 100,
            question_id: id * 10,
            option_letter: 'A',
            option_text: 'Option A',
            is_correct: true,
            feedback: null,
          },
        ],
      },
    ],
    exam_task_types: {
      id: 101,
      name: 'Reading',
      task_code: 'B2_READ_GAPPED_TEXT',
      description: null,
      exam_type_id: 11,
      level_id: 22,
      created_at: '2024-01-01T00:00:00.000Z',
      default_time_minutes: null,
    },
  });

  return {
    createDeferred: createDeferredInner,
    pendingRequests: pendingRequestsInner,
    createExerciseRecord: createExerciseRecordInner,
  };
});

vi.mock('@/integrations/supabase/client', () => {
  const buildQuery = () => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.single = vi.fn(() => {
      const deferred = createDeferred<SupabaseResponse>();
      pendingRequests.push(deferred);
      return deferred.promise;
    });
    return builder;
  };

  return {
    supabase: {
      from: vi.fn(() => buildQuery()),
    },
  };
});

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { useExerciseData } from './useExerciseData';

describe('useExerciseData concurrency', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pendingRequests.length = 0;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('clears stale exercise data when a newer fetch fails', async () => {
    const { result, rerender } = renderHook(
      ({ exerciseId }) => useExerciseData(exerciseId),
      {
        initialProps: { exerciseId: '1' },
      }
    );

    await waitFor(() => expect(pendingRequests.length).toBe(1));

    rerender({ exerciseId: '2' });

    await waitFor(() => expect(pendingRequests.length).toBe(2));

    await act(async () => {
      pendingRequests[0]?.resolve({ data: createExerciseRecord(1), error: null });
      await pendingRequests[0]?.promise;
    });

    expect(result.current.exerciseData).toBeNull();

    await act(async () => {
      pendingRequests[1]?.resolve({ data: null, error: { message: 'Network failure' } });
      await pendingRequests[1]?.promise;
    });

    await waitFor(() => {
      expect(result.current.exerciseData).toBeNull();
      expect(result.current.error).toBe('Failed to load exercise: Network failure');
    });
  });
});
