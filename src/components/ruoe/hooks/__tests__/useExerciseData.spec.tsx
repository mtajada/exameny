import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import React, { useEffect } from 'react';

import { useExerciseData } from '../useExerciseData';
import type { UseExerciseDataReturn } from '../../../../types/ruoe';

const mockUserId = 'test-user';

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({ user: { id: mockUserId } }),
}));

const supabaseMocks = vi.hoisted(() => {
  const singleMock = vi.fn();
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { singleMock, eqMock, selectMock, fromMock };
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: supabaseMocks.fromMock,
  },
}));

type SupabaseResult = { data: unknown; error: { message: string } | null };

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createExerciseRecord = (id: number) => ({
  id,
  task_type_id: id + 100,
  academy_id: 42,
  author_id: 'author',
  title: `Exercise ${id}`,
  content_text: 'content',
  is_public: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ruoe_questions: [
    {
      id: id * 10,
      exercise_id: id,
      order: 1,
      question_text: 'Question text',
      correct_answers: ['answer'],
      explanation: 'explanation',
      original_sentence: null,
      transformation_sentence: null,
      ruoe_options: [],
    },
  ],
  exam_task_types: {
    id: id + 500,
    exam_id: 1,
    level_id: 1,
    task_code: 'CODE',
    name: 'Task name',
    description: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
});

describe('useExerciseData', () => {
  let container: HTMLDivElement;
  let root: Root;
  const latestResult: { current: UseExerciseDataReturn | null } = { current: null };

  const TestHarness: React.FC<{ exerciseId: string }> = ({ exerciseId }) => {
    const result = useExerciseData(exerciseId);
    latestResult.current = result;
    useEffect(() => {
      latestResult.current = result;
    }, [result]);
    return null;
  };

  const renderHook = (exerciseId: string) => {
    act(() => {
      root.render(<TestHarness exerciseId={exerciseId} />);
    });
  };

  beforeEach(() => {
    supabaseMocks.singleMock.mockReset();
    supabaseMocks.eqMock.mockClear();
    supabaseMocks.selectMock.mockClear();
    supabaseMocks.fromMock.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('ignores stale responses when exercise context changes', async () => {
    const deferredA = createDeferred<SupabaseResult>();
    const deferredB = createDeferred<SupabaseResult>();

    supabaseMocks.singleMock
      .mockImplementationOnce(() => deferredA.promise)
      .mockImplementationOnce(() => deferredB.promise);

    renderHook('1');
    expect(latestResult.current?.isLoading).toBe(true);

    renderHook('2');
    expect(supabaseMocks.singleMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      deferredA.resolve({ data: createExerciseRecord(1), error: null });
      await flushPromises();
    });

    expect(latestResult.current?.exerciseData).toBeNull();
    expect(latestResult.current?.isLoading).toBe(true);

    await act(async () => {
      deferredB.resolve({ data: createExerciseRecord(2), error: null });
      await flushPromises();
    });

    expect(latestResult.current?.exerciseData?.exercise.id).toBe(2);
    expect(latestResult.current?.error).toBeNull();
    expect(latestResult.current?.isLoading).toBe(false);
  });

  it('clears state when the active fetch fails', async () => {
    const deferredA = createDeferred<SupabaseResult>();
    const deferredB = createDeferred<SupabaseResult>();

    supabaseMocks.singleMock
      .mockImplementationOnce(() => deferredA.promise)
      .mockImplementationOnce(() => deferredB.promise);

    renderHook('10');
    renderHook('20');

    await act(async () => {
      deferredA.resolve({ data: createExerciseRecord(10), error: null });
      await flushPromises();
    });

    await act(async () => {
      deferredB.resolve({ data: null, error: { message: 'network down' } });
      await flushPromises();
    });

    expect(latestResult.current?.exerciseData).toBeNull();
    expect(latestResult.current?.error).toBe('Failed to load exercise: network down');
    expect(latestResult.current?.isLoading).toBe(false);
  });

  it('loads an exercise that has id 0', async () => {
    supabaseMocks.singleMock.mockResolvedValueOnce({
      data: createExerciseRecord(0),
      error: null,
    });

    renderHook('0');

    expect(supabaseMocks.eqMock).toHaveBeenCalledWith('id', 0);

    await act(async () => {
      await flushPromises();
    });

    expect(latestResult.current?.exerciseData?.exercise.id).toBe(0);
    expect(latestResult.current?.error).toBeNull();
    expect(latestResult.current?.isLoading).toBe(false);
  });
});
