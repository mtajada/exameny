import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { StudentTask } from '@/hooks/useStudentTasks';
import MyTasksPage from '../MyTasksPage';

const navigateMock = vi.fn();

const {
  useStudentTasksMock,
} = vi.hoisted(() => ({
  useStudentTasksMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useStudentTasks', () => ({
  useStudentTasks: (options: unknown) => useStudentTasksMock(options),
}));

const buildRuoETask = (): StudentTask => ({
  id: '10',
  type: 'ruoe',
  origin: 'ai',
  status: 'completed',
  title: 'C1 Use of English Practice',
  description: 'Use of English Part 3',
  date: '2024-06-10T10:00:00.000Z',
  score: 82,
  attemptNumber: 2,
  navTarget: { to: '/ruoe-practice/99?attempt=10&view=results' },
  teacherName: null,
  estimatedMinutes: undefined,
  taskTypeId: 501,
  taskCode: 'C1_LANG_WORD_FORMATION',
  examTypeId: 200,
  examTypeCode: 'C1',
  examTypeName: 'C1',
  levelId: 3,
  levelCode: 'C1',
  levelName: 'Advanced',
  actualTimeSeconds: null,
  meta: {
    skill: 'ruoe',
    skillLabel: 'Use of English',
    sectionLabel: 'Use of English',
    partLabel: 'Part 3',
    partKey: 'P3',
    partNumber: 3,
    formatLabel: 'Word formation',
  },
});

describe('MyTasksPage attempt metadata', () => {
  it('renders attempt number and status badges for RUoE tasks and navigates with attempt param', () => {
    navigateMock.mockReset();

    useStudentTasksMock.mockReturnValue({
      tasks: [buildRuoETask()],
      filters: {
        skills: [],
        exams: [],
        sections: [],
        parts: [],
        formats: [],
      },
      loading: false,
      error: null,
      source: {
        assigned: { loading: false, error: null, refetch: vi.fn() },
        submissions: { loading: false, error: null, refetch: vi.fn() },
        ruoe: { loading: false, error: null, refetch: vi.fn() },
        refetchAll: vi.fn(),
      },
    });

    render(
      <MemoryRouter>
        <MyTasksPage />
      </MemoryRouter>,
    );

    const card = screen.getByRole('button', { name: /C1 Use of English Practice/i });
    expect(within(card).getByText('Attempt #2')).toBeTruthy();
    expect(within(card).getByText('Completed')).toBeTruthy();
    expect(within(card).getByText(/Attempt #2 \(Completed\)/i)).toBeTruthy();
    fireEvent.click(card);

    expect(navigateMock).toHaveBeenCalledWith('/ruoe-practice/99?attempt=10&view=results', undefined);
  });
});
