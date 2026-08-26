import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import type {
  TaskConfigurationExamOption,
  TaskConfigurationLevelOption,
  TaskConfigurationTaskTypeOption,
} from './TaskConfigurationCard.tsx'

function isViteFlagEnabled(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

const INCLUDE_E2E_EXAMS = import.meta.env.DEV && isViteFlagEnabled(import.meta.env.VITE_INCLUDE_E2E_EXAMS)

export const useExamOptions = (enabled = false) =>
  useQuery({
    queryKey: ['exam-types'],
    queryFn: async (): Promise<TaskConfigurationExamOption[]> => {
      if (!enabled) return []
      let query = supabase.from('exam_types').select('id, code, name')
      if (!INCLUDE_E2E_EXAMS) {
        query = query.not('code', 'ilike', 'E2E_EXAM_%')
      }

      const { data, error } = await query.order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as TaskConfigurationExamOption[]
    },
    enabled,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 20,
  })

export const useLevelOptions = (selectedExamIdNumeric: number | null) =>
  useQuery({
    queryKey: ['exam-levels', selectedExamIdNumeric],
    queryFn: async (): Promise<TaskConfigurationLevelOption[]> => {
      if (!selectedExamIdNumeric) return []

      const { data, error } = await supabase
        .from('exam_task_types')
        .select('level:levels!inner(id, name, code)')
        .eq('exam_type_id', selectedExamIdNumeric)

      if (error) throw error

      const unique = new Map<string, TaskConfigurationLevelOption>()
      ;(data ?? []).forEach((item: { level: TaskConfigurationLevelOption | null }) => {
        if (!item.level) return
        const key = String(item.level.id)
        if (!unique.has(key)) {
          unique.set(key, item.level)
        }
      })

      return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name))
    },
    enabled: Boolean(selectedExamIdNumeric),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 20,
  })

export const useTaskTypeOptions = (selectedExamIdNumeric: number | null, selectedLevelIdNumeric: number | null) =>
  useQuery({
    queryKey: ['exam-task-types', selectedExamIdNumeric, selectedLevelIdNumeric],
    queryFn: async (): Promise<TaskConfigurationTaskTypeOption[]> => {
      if (!selectedExamIdNumeric || !selectedLevelIdNumeric) return []

      const { data, error } = await supabase
        .from('exam_task_types')
        .select('id, name, task_code, description, default_time_minutes')
        .eq('exam_type_id', selectedExamIdNumeric)
        .eq('level_id', selectedLevelIdNumeric)
        .order('name', { ascending: true })

      if (error) throw error
      return (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        taskCode: item.task_code,
        description: item.description,
        defaultTimeMinutes: item.default_time_minutes,
      }))
    },
    enabled: Boolean(selectedExamIdNumeric && selectedLevelIdNumeric),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 20,
  })
