import { describe, expect, it } from 'vitest'
import { getDefaultWritingTips, getWritingTips } from '../data/taskGenerationTips'

describe('getWritingTips', () => {
  it('returns clean-room defaults when task data is missing', () => {
    expect(getWritingTips({})).toEqual(getDefaultWritingTips())
  })

  it('returns task-specific tips for a neutral essay code', () => {
    const tips = getWritingTips({ taskCode: 'B2_WRITE_ESSAY' })
    expect(tips[0]?.text).toContain('clear position')
    expect(tips).toHaveLength(4)
  })

  it('returns data-summary guidance without relying on an exam brand', () => {
    const tips = getWritingTips({ taskCode: 'C1_WRITE_DATA_SUMMARY' })
    expect(tips[0]?.text).toContain('overview')
    expect(tips).toHaveLength(4)
  })
})
