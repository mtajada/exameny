import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORY_LABELS,
  buildMistakeGroups,
  computeSummaryFromGroups,
  mergeSummaryCounts,
  normalizeCategoryCode,
  normalizeFeatureTags,
  type SupabaseMistakeRow,
} from '../utils.ts'

const baseRow: SupabaseMistakeRow = {
  id: '1',
  anchor_text: 'sample text',
  anchor_start: 0,
  anchor_end: 5,
  suggested_correction: null,
  explanation: 'Explanation',
  meta: null,
  category: { code: 'GR', name: DEFAULT_CATEGORY_LABELS.GR },
  tag: { code: 'TENSE_ASPECT', name: 'Tense & Aspect' },
}

describe('normalizeFeatureTags', () => {
  it('returns canonical tags from meta when available', () => {
    const result = normalizeFeatureTags({ feature_tags: ['word_choice', 'SVA'] }, null)
    expect(result).toEqual(['WORD_CHOICE', 'SVA'])
  })

  it('falls back to tag code when meta tags missing', () => {
    const result = normalizeFeatureTags(null, 'verb_form')
    expect(result).toEqual(['VERB_FORM'])
  })
})

describe('buildMistakeGroups', () => {
  it('groups mistakes by category and aggregates tag counts', () => {
    const rows: SupabaseMistakeRow[] = [
      baseRow,
      {
        ...baseRow,
        id: '2',
        anchor_text: 'lexis issue',
        anchor_start: 10,
        anchor_end: 20,
        category: { code: 'LX', name: DEFAULT_CATEGORY_LABELS.LX },
        tag: { code: 'WORD_CHOICE', name: 'Word Choice' },
      },
      {
        ...baseRow,
        id: '3',
        meta: { feature_tags: ['sva'] },
      },
    ]

    const groups = buildMistakeGroups(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0]?.categoryCode).toBe('GR')
    expect(groups[0]?.count).toBe(2)
    expect(groups[0]?.tags).toEqual([
      { tagCode: 'SVA', count: 1 },
      { tagCode: 'TENSE_ASPECT', count: 1 },
    ])

    expect(groups[1]?.categoryCode).toBe('LX')
    expect(groups[1]?.count).toBe(1)
    expect(groups[1]?.tags[0]).toEqual({ tagCode: 'WORD_CHOICE', count: 1 })
  })
})

describe('mergeSummaryCounts', () => {
  it('merges evaluation summary with group summary without losing totals', () => {
    const groupSummary = computeSummaryFromGroups(
      buildMistakeGroups([
        baseRow,
        { ...baseRow, id: '2', category: { code: 'LX', name: DEFAULT_CATEGORY_LABELS.LX } },
      ]),
    )

    const merged = mergeSummaryCounts(groupSummary, {
      byCategory: { RS: 1 },
      total: 3,
    })

    expect(merged.byCategory.GR).toBe(1)
    expect(merged.byCategory.LX).toBe(1)
    expect(merged.byCategory.RS).toBe(1)
    expect(merged.total).toBe(3)
  })

  it('uses the maximum count per category to keep totals consistent', () => {
    const groupSummary = computeSummaryFromGroups(
      buildMistakeGroups([
        baseRow,
        { ...baseRow, id: '2' },
        { ...baseRow, id: '3' },
      ]),
    )

    const merged = mergeSummaryCounts(groupSummary, {
      byCategory: { GR: 6 },
      total: 6,
    })

    expect(merged.byCategory.GR).toBe(6)
    expect(merged.total).toBe(6)
  })
})

describe('normalizeCategoryCode', () => {
  it('defaults to GR when category is unknown', () => {
    expect(normalizeCategoryCode('UNKNOWN')).toBe('GR')
  })

  it('preserves valid category codes', () => {
    expect(normalizeCategoryCode('lx')).toBe('LX')
  })
})
