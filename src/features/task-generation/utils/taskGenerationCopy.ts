export type TaskGenerationSkill = 'writing' | 'ruoe'

export interface TaskGenerationCopyInput {
  skill: TaskGenerationSkill
  taskName?: string | null
}

export interface TaskGenerationCopy {
  title: string
  subtitle?: string
  statusLabel: string
  monitorCopy: string
  tipsTitle: string
  supportingCopy?: string
}

const DEFAULT_MONITOR_COPY = 'AI usage is monitored. Please keep the tab open until the exercise is ready.'

const DEFAULTS: Record<TaskGenerationSkill, Omit<TaskGenerationCopy, 'title' | 'tipsTitle'> & { tipsLabelTemplate: string }> = {
  writing: {
    subtitle: 'We are drafting a tailored prompt and recommended timing for you.',
    statusLabel: 'Progress',
    monitorCopy: DEFAULT_MONITOR_COPY,
    tipsLabelTemplate: 'Tips for %s',
  },
  ruoe: {
    subtitle: 'Sit tight while we assemble a brand-new Reading & Use of English exercise.',
    statusLabel: 'Progress',
    monitorCopy: DEFAULT_MONITOR_COPY,
    supportingCopy: undefined,
    tipsLabelTemplate: 'Tips for %s',
  },
}

const resolveTaskLabel = (skill: TaskGenerationSkill, taskName?: string | null) => {
  if (taskName && taskName.trim().length > 0) {
    return taskName.trim()
  }
  return skill === 'writing' ? 'writing task' : 'R&UoE exercise'
}

export const getTaskGenerationCopy = ({ skill, taskName }: TaskGenerationCopyInput): TaskGenerationCopy => {
  const defaults = DEFAULTS[skill]
  const resolvedLabel = resolveTaskLabel(skill, taskName)

  return {
    title: skill === 'writing'
      ? `Generating your ${resolvedLabel}...`
      : `Generating your ${resolvedLabel}...`,
    subtitle: defaults.subtitle,
    statusLabel: defaults.statusLabel,
    monitorCopy: defaults.monitorCopy,
    supportingCopy: defaults.supportingCopy,
    tipsTitle: defaults.tipsLabelTemplate.replace('%s', resolvedLabel),
  }
}
