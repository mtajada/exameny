import { describe, expect, it } from 'vitest'
import type { MistakeItemPreview } from '@/hooks/mistakes/types.ts'
import { buildHighlightSegments } from '../highlightUtils.ts'

type AnchoredMistakeItemPreview = MistakeItemPreview & {
  anchorResolution: { status: 'anchored'; start: number; end: number }
}

const baseMistake: AnchoredMistakeItemPreview = {
  id: '1',
  anchorText: 'sample',
  anchorPatch: null,
  explanation: 'Explanation',
  categoryCode: 'GR',
  featureTags: ['WORD_ORDER'],
  suggestedCorrection: null,
  anchorStart: 0,
  anchorEnd: 6,
  anchorResolution: { status: 'anchored', start: 0, end: 6 },
  anchorAdjustment: null,
}

const unanchoredMistake: MistakeItemPreview = {
  id: 'unanchored',
  anchorText: 'sample',
  anchorPatch: null,
  explanation: 'Explanation',
  categoryCode: 'GR',
  featureTags: ['WORD_ORDER'],
  suggestedCorrection: null,
  anchorStart: null,
  anchorEnd: null,
  anchorResolution: { status: 'not_found' },
  anchorAdjustment: null,
}

describe('buildHighlightSegments', () => {
  it('creates a single highlighted segment when one mistake spans entire text', () => {
    const segments = buildHighlightSegments('sample text', [baseMistake])
    expect(segments).toHaveLength(2)
    expect(segments[0]?.mistakeIds).toEqual(['1'])
    expect(segments[0]?.text).toBe('sample')
    expect(segments[1]?.mistakeIds).toEqual([])
    expect(segments[1]?.text).toBe(' text')
  })

  it('splits overlapping mistakes into distinct segments', () => {
    const overlapping: AnchoredMistakeItemPreview = {
      ...baseMistake,
      id: '2',
      anchorStart: 4,
      anchorEnd: 11,
      anchorResolution: { status: 'anchored', start: 4, end: 11 },
    }

    const segments = buildHighlightSegments('sample text', [baseMistake, overlapping])
    expect(segments).toHaveLength(3)
    expect(segments[0]?.mistakeIds).toEqual(['1'])
    expect(segments[1]?.mistakeIds.sort()).toEqual(['1', '2'])
    expect(segments[2]?.mistakeIds).toEqual(['2'])
  })

  it('ignores mistakes outside text bounds', () => {
    const outOfBounds: AnchoredMistakeItemPreview = {
      ...baseMistake,
      id: '3',
      anchorStart: 50,
      anchorEnd: 60,
      anchorResolution: { status: 'anchored', start: 50, end: 60 },
    }

    const segments = buildHighlightSegments('text', [outOfBounds])
    expect(segments).toHaveLength(1)
    expect(segments[0]?.mistakeIds).toEqual([])
    expect(segments[0]?.text).toBe('text')
  })

  it('ignores unanchored mistakes entirely', () => {
    const segments = buildHighlightSegments('sample text', [unanchoredMistake])
    expect(segments).toHaveLength(1)
    expect(segments[0]?.mistakeIds).toEqual([])
    expect(segments[0]?.text).toBe('sample text')
  })
})
