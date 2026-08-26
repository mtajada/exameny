import { useMemo } from 'react';
import { useStudentTasks } from '@/hooks/useStudentTasks';

/**
 * Returns number of homework items: teacher-assigned tasks not yet finished.
 * Uses a large limit to avoid truncation of the count in typical scenarios.
 */
export function useHomeworkCount() {
  const { tasks } = useStudentTasks({ limit: 1000, includeAllHomework: true });

  const homeworkCount = useMemo(() => (
    tasks.filter((t) => t.origin === 'teacher' && t.status !== 'evaluated' && t.status !== 'completed').length
  ), [tasks]);

  return { homeworkCount };
}
