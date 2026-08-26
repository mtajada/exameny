import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

export interface ExamOption {
  id: number;
  code: string;
  name: string;
}

export interface LevelOption {
  id: number;
  code: string;
  name: string;
}

type ExamRow = {
  id: number;
  code: string;
  name: string;
};

function isViteFlagEnabled(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

const INCLUDE_E2E_EXAMS = import.meta.env.DEV && isViteFlagEnabled(import.meta.env.VITE_INCLUDE_E2E_EXAMS);

const fetchExamOptions = async (): Promise<ExamOption[]> => {
  let query = supabase.from('exam_types').select('id, code, name');
  if (!INCLUDE_E2E_EXAMS) {
    query = query.not('code', 'ilike', 'E2E_EXAM_%');
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ExamRow[];
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
  }));
};

export const useExamOptions = () =>
  useQuery({
    queryKey: ['exam-types'],
    queryFn: fetchExamOptions,
    staleTime: 1000 * 60 * 5,
  });

type LevelRow = {
  levels: {
    id: number;
    code: string | null;
    name: string | null;
  } | null;
};

const fetchLevelsForExam = async (examId: number): Promise<LevelOption[]> => {
  const { data, error } = await supabase
    .from('exam_task_types')
    .select('levels!inner(id, code, name)')
    .eq('exam_type_id', examId);

  if (error) {
    throw error;
  }

  const unique = new Map<number, LevelOption>();
  ((data ?? []) as LevelRow[]).forEach((entry) => {
    const level = entry.levels;
    if (level && typeof level.id === 'number' && !unique.has(level.id)) {
      unique.set(level.id, {
        id: level.id,
        code: level.code ?? '',
        name: level.name ?? '',
      });
    }
  });

  return Array.from(unique.values()).sort((a, b) => a.id - b.id);
};

export const useExamLevels = (examId: number | null) =>
  useQuery({
    queryKey: ['exam-levels', examId],
    queryFn: () => fetchLevelsForExam(examId as number),
    enabled: typeof examId === 'number' && !Number.isNaN(examId),
    staleTime: 1000 * 60 * 5,
  });
