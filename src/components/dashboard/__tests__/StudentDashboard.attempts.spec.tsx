import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { StudentTask } from '@/hooks/useStudentTasks';
import StudentDashboard from '../StudentDashboard';

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

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'student-1' },
    profile: { role: 'student' },
    memberships: [],
    activeAcademyId: null,
    activeMembershipId: null,
  }),
}));

const buildRuoETask = (): StudentTask => ({
  id: '42',
  type: 'ruoe',
  origin: 'teacher',
  status: 'in_progress',
  title: 'Assigned R&UoE Exercise',
  description: 'Use of English Part 2',
  date: '2024-06-12T09:30:00.000Z',
  score: undefined,
  attemptNumber: 3,
  navTarget: { to: '/ruoe-practice/150?attempt=42&view=practice' },
  teacherName: 'Prof. Lee',
  estimatedMinutes: 12,
  taskTypeId: 601,
  taskCode: 'C1_LANG_OPEN_CLOZE',
  examTypeId: 210,
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
    partLabel: 'Part 2',
    partKey: 'P2',
    partNumber: 2,
    formatLabel: 'Open cloze',
  },
});

describe('StudentDashboard attempt metadata', () => {
  it('shows attempt number/status badges and navigates with attempt parameter', () => {
    navigateMock.mockReset();

    useStudentTasksMock.mockReturnValue({
      tasks: [buildRuoETask()],
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
        <StudentDashboard />
      </MemoryRouter>,
    );

    const card = screen.getByRole('button', { name: /Assigned R&UoE Exercise/i });
    expect(within(card).getByText('Attempt #3')).toBeTruthy();
    expect(within(card).getByText('In progress')).toBeTruthy();
    expect(within(card).getByText(/Attempt #3 \(In progress\)/i)).toBeTruthy();
    fireEvent.click(card);

    expect(navigateMock).toHaveBeenCalledWith('/ruoe-practice/150?attempt=42&view=practice', undefined);
  });
});
