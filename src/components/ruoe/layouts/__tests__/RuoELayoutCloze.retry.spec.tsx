import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuoELayoutCloze } from '../RuoELayoutCloze';
import type { LayoutProps } from '../../../../types/ruoe';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

const unifiedPanelSpy = vi.fn();
vi.mock('../UnifiedRightPanel', () => ({
  UnifiedRightPanel: (props: unknown) => {
    unifiedPanelSpy(props);
    return null;
  },
}));

const contentZoneSpy = vi.fn();
vi.mock('@/components/ruoe/zones/ContentZone', () => ({
  ContentZone: (props: unknown) => {
    contentZoneSpy(props);
    return null;
  },
}));

vi.mock('@/components/ruoe/layouts/ExamTwoPaneFrame', () => ({
  default: ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
    <div>
      <div data-testid="frame-left">{left}</div>
      <div data-testid="frame-right">{right}</div>
    </div>
  ),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/hooks/usePendingSaveGuard', () => ({
  usePendingSaveGuard: () => undefined,
}));

let userAnswersMock: Record<number, string> = {};
const flushPendingSavesMock = vi.fn().mockResolvedValue('flushed');

vi.mock('@/components/ruoe/hooks/useAnswerTracking', () => ({
  useAnswerTracking: vi.fn(() => ({
    userAnswers: userAnswersMock,
    updateAnswer: vi.fn(),
    hasPendingChanges: false,
    isSaving: false,
    flushPendingSaves: flushPendingSavesMock,
  })),
}));

vi.mock('@/components/ruoe/hooks/usePersistedQuestionCursor', () => ({
  usePersistedQuestionCursor: vi.fn(() => ({
    snapshot: null,
    setQuestionId: vi.fn(),
    setQuestionIndex: vi.fn(),
    clearSnapshot: vi.fn(),
    hydrated: true,
  })),
}));

const baseExerciseData: LayoutProps['exerciseData'] = {
  exercise: {
    id: 42,
    academy_id: 1,
    author_id: null,
    title: 'Sample Exercise',
    content_text: 'Content with gap {{GAP_1}}.',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    is_public: false,
    task_type_id: 77,
    teacher_theme: null,
    teacher_skill_focus: null,
  },
  questions: [
    {
      id: 101,
      exercise_id: 42,
      order: 1,
      displayOrder: 1,
      question_text: null,
      correct_answers: ['Alpha'],
      explanation: null,
      original_sentence: null,
      transformation_sentence: null,
    },
  ],
  options: [
    {
      id: 201,
      feedback: null,
      is_correct: true,
      question_id: 101,
      option_letter: 'A',
      option_text: 'Alpha',
    },
  ],
  taskType: {
    id: 77,
    task_code: 'C1_LANG_MC_CLOZE',
    name: 'Part 1',
    description: null,
    exam_type_id: 1,
    level_id: 1,
    created_at: '2024-01-01T00:00:00.000Z',
    default_time_minutes: null,
  },
  displayOrderByQuestionId: {
    101: 1,
  },
};

const exerciseData = baseExerciseData;

const commonProps: Omit<LayoutProps, 'attemptId'> = {
  exerciseData,
  onEvaluate: () => Promise.resolve(),
  isEvaluated: false,
  evaluationResults: {},
  isEvaluating: false,
  evaluationData: null,
};

describe('RuoELayoutCloze – attempt resets', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    unifiedPanelSpy.mockReset();
    contentZoneSpy.mockReset();
    userAnswersMock = { 101: 'Alpha' };
  });

  it('clears optimistic answers when the attempt id changes', async () => {
    const { rerender } = render(
      <RuoELayoutCloze
        {...commonProps}
        attemptId={1}
      />,
    );

    await waitFor(() => {
      const props = unifiedPanelSpy.mock.calls.at(-1)?.[0] as { userAnswers: Record<number, string> } | undefined;
      expect(props?.userAnswers).toEqual({ 101: 'Alpha' });
    });

    userAnswersMock = {};

    rerender(
      <RuoELayoutCloze
        {...commonProps}
        attemptId={2}
      />,
    );

    await waitFor(() => {
      const props = unifiedPanelSpy.mock.calls.at(-1)?.[0] as { userAnswers: Record<number, string> } | undefined;
      expect(props?.userAnswers).toEqual({});
    });
  });
});
