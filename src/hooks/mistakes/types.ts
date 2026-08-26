export const MISTAKE_CATEGORY_ORDER = ['GR', 'LX', 'ME', 'DC', 'RS', 'TA'] as const

export type MistakeCategoryCode = (typeof MISTAKE_CATEGORY_ORDER)[number]

export interface MistakeFeatureTagSummary {
  tagCode: string
  count: number
}

export interface MistakeAnchorPatch {
  before: string
  after: string | null
  contextBefore: string
  contextAfter: string
}

export type MistakeAnchoredStrategy =
  | 'legacy_offsets'
  | 'composite'
  | 'before_unique'
  | 'context_score'
  | 'whitespace'

export type MistakeAmbiguousStrategy =
  | 'context_score'
  | 'before_multiple'

export type MistakeNotFoundStrategy =
  | 'composite'
  | 'before'
  | 'whitespace'

export type MistakeAnchorResolution =
  | {
      status: 'anchored'
      start: number
      end: number
      strategy?: MistakeAnchoredStrategy
      confidence?: number
    }
  | {
      status: 'ambiguous'
      strategy?: MistakeAmbiguousStrategy
      // May be capped at maxCandidates + 1 when resolver stops early.
      candidates?: number
    }
  | {
      status: 'not_found'
      strategy?: MistakeNotFoundStrategy
    }
  | {
      status: 'invalid'
      reason?: string
    }

export interface MistakeAnchorTextAdjustment {
  strategy: 'substring' | 'levenshtein'
  distance: number
  originalAnchorText: string
  normalizedOriginal: string
  normalizedTarget: string
  reportedAnchorText?: string
  originalAnchorStart?: number
  originalAnchorEnd?: number
  adjustedAnchorStart?: number
  adjustedAnchorEnd?: number
  realignmentStatus?: 'aligned' | 'unchanged' | 'not_found' | 'invalid' | 'skipped'
  realignmentModel?: string | null
  realignmentNotes?: string | null
}

export interface MistakeItemPreview {
  id: string
  anchorText: string
  anchorPatch: MistakeAnchorPatch | null
  anchorResolution: MistakeAnchorResolution
  explanation: string
  categoryCode: MistakeCategoryCode
  featureTags: string[]
  suggestedCorrection: string | null
  anchorStart: number | null
  anchorEnd: number | null
  anchorAdjustment: MistakeAnchorTextAdjustment | null
}

export interface MistakeCategoryGroup {
  categoryCode: MistakeCategoryCode
  categoryName: string
  count: number
  tags: MistakeFeatureTagSummary[]
  items: MistakeItemPreview[]
}

export interface MistakesAnalysisSummary {
  total: number
  byCategory: Record<string, number>
}

export type MistakesStatus = 'pending' | 'failed' | 'completed' | 'completed_with_warnings'

export interface MistakesAnalysisWarnings {
  unhighlightableItems: number
  discardedItems: number
  unparsedItems: number
}

export interface MistakesAnalysisState {
  submissionText: string | null
  groups: MistakeCategoryGroup[]
  loading: boolean
  error: string | null
  refetch: (() => Promise<unknown>) | null
  status: MistakesStatus
  summaryCounts: MistakesAnalysisSummary
  warnings: MistakesAnalysisWarnings
  lastErrorMessage: string | null
}
