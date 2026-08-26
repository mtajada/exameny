import type { IconType } from 'react-icons'
import { LuPlus, LuPrinter } from 'react-icons/lu'

export interface TeacherQuickAction {
  id: 'assign-task' | 'print-exercise'
  label: string
  description: string
  to: string
  icon: IconType
  variant: 'default' | 'outline'
}

export const teacherQuickActions: readonly TeacherQuickAction[] = [
  {
    id: 'assign-task',
    label: 'Assign New Task',
    description: 'Select students and craft tailored assignments backed by AI tools.',
    to: '/teacher/assign-task',
    icon: LuPlus,
    variant: 'default',
  },
  {
    id: 'print-exercise',
    label: 'Create & Print Exercise',
    description: 'Generate printable worksheets with answer keys for classroom distribution.',
    to: '/teacher/print-exercise',
    icon: LuPrinter,
    variant: 'outline',
  },
] as const
