import { describe, expect, it } from 'vitest'

import { deriveMistakesStatus } from '../useMistakesAnalysis.ts'

describe('deriveMistakesStatus', () => {
  it('returns failed only when db status is failed and no v2 items exist', () => {
    expect(deriveMistakesStatus({ dbStatus: 'failed', hasV2Items: false, warningCount: 0 }))
      .toBe('failed')
    expect(deriveMistakesStatus({ dbStatus: 'failed', hasV2Items: true, warningCount: 0 }))
      .toBe('completed_with_warnings')
  })

  it('returns completed_with_warnings when v2 items are unhighlightable', () => {
    expect(deriveMistakesStatus({ dbStatus: 'completed', hasV2Items: true, warningCount: 2 }))
      .toBe('completed_with_warnings')
    expect(deriveMistakesStatus({ dbStatus: 'completed', hasV2Items: true, unhighlightableCount: 2 }))
      .toBe('completed_with_warnings')
  })
})
