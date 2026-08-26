export { default as TipsCarousel } from './components/TipsCarousel'
export type { TipItem } from './components/TipsCarousel'

export { default as TaskGenerationScreen } from './components/TaskGenerationScreen'
export { useTaskAutoProgress } from './hooks/useTaskAutoProgress'
export type { TaskAutoProgressPreset } from './hooks/useTaskAutoProgress'

export { getWritingTips, getRuoeTips, getDefaultTips, getDefaultWritingTips, getDefaultRuoeTips } from './data/taskGenerationTips'
export { getTaskGenerationCopy } from './utils/taskGenerationCopy'
export type { TaskGenerationCopy, TaskGenerationCopyInput, TaskGenerationSkill } from './utils/taskGenerationCopy'
