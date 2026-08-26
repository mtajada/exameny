import {
  MISTAKE_CATEGORY_ORDER,
  type MistakeAnchorResolution,
  type MistakeAnchorTextAdjustment,
  type MistakeCategoryCode,
  type MistakeCategoryGroup,
  type MistakeFeatureTagSummary,
  type MistakeItemPreview,
  type MistakesAnalysisSummary,
} from './types.ts'

export const DEFAULT_CATEGORY_LABELS: Record<MistakeCategoryCode, string> = {
  GR: 'Grammar',
  LX: 'Lexis',
  ME: 'Mechanics',
  DC: 'Discourse & Cohesion',
  RS: 'Register & Style',
  TA: 'Task & Requirements',
}

type RealignmentStatus = NonNullable<MistakeAnchorTextAdjustment['realignmentStatus']>
const VALID_REALIGNMENT_STATUSES = new Set<string>(['aligned', 'unchanged', 'not_found', 'invalid', 'skipped'])

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isRealignmentStatus = (value: string): value is RealignmentStatus =>
  VALID_REALIGNMENT_STATUSES.has(value)

export interface SupabaseMistakeRow {
  id: string
  anchor_text: string
  anchor_start: number
  anchor_end: number
  suggested_correction: string | null
  explanation: string
  meta: Record<string, unknown> | null
  category: { code: string | null; name: string | null } | null
  tag: { code: string | null; name: string | null } | null
}

export function isMistakeCategoryCode(value: string | null | undefined): value is MistakeCategoryCode {
  if (!value) return false
  return (MISTAKE_CATEGORY_ORDER as readonly string[]).includes(value.toUpperCase())
}

export function normalizeCategoryCode(raw: string | null | undefined): MistakeCategoryCode {
  if (isMistakeCategoryCode(raw)) {
    return raw.toUpperCase() as MistakeCategoryCode
  }
  return 'GR'
}

function extractArrayOfStrings(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) return []
  const entries = candidate.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  const unique = new Set(entries.map((entry) => entry.trim().toUpperCase()))
  return Array.from(unique)
}

export function normalizeFeatureTags(meta: Record<string, unknown> | null, fallbackTagCode: string | null): string[] {
  const featureTags = extractArrayOfStrings(meta?.['feature_tags'])
  if (featureTags.length > 0) {
    return featureTags
  }

  if (fallbackTagCode && typeof fallbackTagCode === 'string' && fallbackTagCode.trim().length > 0) {
    return [fallbackTagCode.trim().toUpperCase()]
  }

  const truncatedTags = extractArrayOfStrings(meta?.['truncated_feature_tags'])
  if (truncatedTags.length > 0) {
    return truncatedTags
  }

  return []
}

function extractAnchorAdjustment(meta: Record<string, unknown> | null): MistakeItemPreview['anchorAdjustment'] {
  if (!meta || typeof meta !== 'object') return null
  const rawAdjustment = meta['anchor_text_adjustment']
  if (!isPlainRecord(rawAdjustment)) return null

  const candidate = rawAdjustment
  const strategy = candidate.strategy
  const distanceValue = candidate.distance
  const originalAnchorText = candidate.originalAnchorText
  const normalizedOriginal = candidate.normalizedOriginal
  const normalizedTarget = candidate.normalizedTarget

  if (strategy !== 'substring' && strategy !== 'levenshtein') {
    return null
  }

  const distance = typeof distanceValue === 'number' && Number.isFinite(distanceValue) ? distanceValue : null
  if (
    distance === null ||
    typeof originalAnchorText !== 'string' ||
    typeof normalizedOriginal !== 'string' ||
    typeof normalizedTarget !== 'string'
  ) {
    return null
  }

  const reportedAnchorText =
    typeof candidate.reportedAnchorText === 'string' && candidate.reportedAnchorText.trim().length > 0
      ? candidate.reportedAnchorText.trim()
      : undefined
  const originalAnchorStart = typeof candidate.originalAnchorStart === 'number' ? candidate.originalAnchorStart : undefined
  const originalAnchorEnd = typeof candidate.originalAnchorEnd === 'number' ? candidate.originalAnchorEnd : undefined
  const adjustedAnchorStart = typeof candidate.adjustedAnchorStart === 'number' ? candidate.adjustedAnchorStart : undefined
  const adjustedAnchorEnd = typeof candidate.adjustedAnchorEnd === 'number' ? candidate.adjustedAnchorEnd : undefined
  const rawStatus = typeof candidate.realignmentStatus === 'string' ? candidate.realignmentStatus : null
  const realignmentStatus = rawStatus && isRealignmentStatus(rawStatus)
    ? rawStatus
    : undefined
  const realignmentModel =
    typeof candidate.realignmentModel === 'string' && candidate.realignmentModel.trim().length > 0
      ? candidate.realignmentModel.trim()
      : null
  const realignmentNotes =
    typeof candidate.realignmentNotes === 'string' && candidate.realignmentNotes.trim().length > 0
      ? candidate.realignmentNotes.trim()
      : null

  return {
    strategy,
    distance,
    originalAnchorText,
    normalizedOriginal,
    normalizedTarget,
    reportedAnchorText,
    originalAnchorStart,
    originalAnchorEnd,
    adjustedAnchorStart,
    adjustedAnchorEnd,
    realignmentStatus,
    realignmentModel,
    realignmentNotes,
  }
}

function buildMistakePreview(row: SupabaseMistakeRow, categoryCode: MistakeCategoryCode): MistakeItemPreview {
  const featureTags = normalizeFeatureTags(row.meta, row.tag?.code ?? null)
  const anchorResolution: MistakeAnchorResolution = {
    status: 'anchored',
    start: row.anchor_start,
    end: row.anchor_end,
    strategy: 'legacy_offsets',
    confidence: 1,
  }
  return {
    id: row.id,
    anchorText: row.anchor_text,
    anchorPatch: null,
    anchorResolution,
    explanation: row.explanation,
    categoryCode,
    featureTags,
    suggestedCorrection: row.suggested_correction ?? null,
    anchorStart: row.anchor_start,
    anchorEnd: row.anchor_end,
    anchorAdjustment: extractAnchorAdjustment(row.meta),
  }
}

function sortItemsByAnchorStart(items: MistakeItemPreview[]): MistakeItemPreview[] {
  return items.sort((a, b) => {
    const aStart = typeof a.anchorStart === 'number' && Number.isFinite(a.anchorStart) ? a.anchorStart : Number.POSITIVE_INFINITY
    const bStart = typeof b.anchorStart === 'number' && Number.isFinite(b.anchorStart) ? b.anchorStart : Number.POSITIVE_INFINITY
    if (aStart === bStart) {
      return a.anchorText.localeCompare(b.anchorText)
    }
    return aStart - bStart
  })
}

function sortTagSummaries(summaries: MistakeFeatureTagSummary[]): MistakeFeatureTagSummary[] {
  return summaries.sort((a, b) => {
    if (b.count === a.count) return a.tagCode.localeCompare(b.tagCode)
    return b.count - a.count
  })
}

export function buildMistakeGroups(rows: SupabaseMistakeRow[]): MistakeCategoryGroup[] {
  const groupMap = new Map<MistakeCategoryCode, { name: string; items: MistakeItemPreview[]; tagCounts: Map<string, number> }>()

  for (const row of rows) {
    const categoryCode = normalizeCategoryCode(row.category?.code ?? null)
    const categoryName = row.category?.name?.trim() || DEFAULT_CATEGORY_LABELS[categoryCode]
    const preview = buildMistakePreview(row, categoryCode)
    const existing = groupMap.get(categoryCode) ?? {
      name: categoryName,
      items: [],
      tagCounts: new Map<string, number>(),
    }

    existing.name = categoryName
    existing.items.push(preview)

    if (preview.featureTags.length > 0) {
      for (const tag of preview.featureTags) {
        existing.tagCounts.set(tag, (existing.tagCounts.get(tag) ?? 0) + 1)
      }
    }

    groupMap.set(categoryCode, existing)
  }

  const groups = Array.from(groupMap.entries()).map<MistakeCategoryGroup>(([categoryCode, data]) => ({
    categoryCode,
    categoryName: data.name,
    count: data.items.length,
    tags: sortTagSummaries(Array.from(data.tagCounts.entries()).map(([tagCode, count]) => ({ tagCode, count }))),
    items: sortItemsByAnchorStart(data.items),
  }))

  const orderMap = new Map(MISTAKE_CATEGORY_ORDER.map((code, index) => [code, index]))
  groups.sort((a, b) => {
    const orderDiff = (orderMap.get(a.categoryCode) ?? 99) - (orderMap.get(b.categoryCode) ?? 99)
    if (orderDiff !== 0) return orderDiff
    return a.categoryName.localeCompare(b.categoryName)
  })

  return groups
}

export function buildMistakeGroupsFromItems(
  items: MistakeItemPreview[],
  categoryNameByCode: Map<MistakeCategoryCode, string> = new Map(),
): MistakeCategoryGroup[] {
  const groupMap = new Map<MistakeCategoryCode, { name: string; items: MistakeItemPreview[]; tagCounts: Map<string, number> }>()

  for (const item of items) {
    const categoryCode = normalizeCategoryCode(item.categoryCode)
    const categoryName = categoryNameByCode.get(categoryCode) ?? DEFAULT_CATEGORY_LABELS[categoryCode]
    const existing = groupMap.get(categoryCode) ?? {
      name: categoryName,
      items: [],
      tagCounts: new Map<string, number>(),
    }

    existing.name = categoryName
    existing.items.push(item)

    if (item.featureTags.length > 0) {
      for (const tag of item.featureTags) {
        existing.tagCounts.set(tag, (existing.tagCounts.get(tag) ?? 0) + 1)
      }
    }

    groupMap.set(categoryCode, existing)
  }

  const groups = Array.from(groupMap.entries()).map<MistakeCategoryGroup>(([categoryCode, data]) => ({
    categoryCode,
    categoryName: data.name,
    count: data.items.length,
    tags: sortTagSummaries(Array.from(data.tagCounts.entries()).map(([tagCode, count]) => ({ tagCode, count }))),
    items: sortItemsByAnchorStart(data.items),
  }))

  const orderMap = new Map(MISTAKE_CATEGORY_ORDER.map((code, index) => [code, index]))
  groups.sort((a, b) => {
    const orderDiff = (orderMap.get(a.categoryCode) ?? 99) - (orderMap.get(b.categoryCode) ?? 99)
    if (orderDiff !== 0) return orderDiff
    return a.categoryName.localeCompare(b.categoryName)
  })

  return groups
}

export function computeSummaryFromGroups(groups: MistakeCategoryGroup[]): MistakesAnalysisSummary {
  const byCategory: Record<string, number> = {}
  let total = 0
  for (const group of groups) {
    byCategory[group.categoryCode] = group.count
    total += group.count
  }
  return { total, byCategory }
}

export function mergeSummaryCounts(
  groupsSummary: MistakesAnalysisSummary,
  evaluationSummary: Partial<MistakesAnalysisSummary> | null | undefined,
): MistakesAnalysisSummary {
  const merged: MistakesAnalysisSummary = {
    total: groupsSummary.total,
    byCategory: { ...groupsSummary.byCategory },
  }

  if (evaluationSummary?.byCategory) {
    for (const [rawCategory, rawCount] of Object.entries(evaluationSummary.byCategory)) {
      const normalizedCategory = normalizeCategoryCode(rawCategory)
      const numericCount = typeof rawCount === 'number' && Number.isFinite(rawCount) ? Math.max(0, Math.round(rawCount)) : 0
      const currentCount = merged.byCategory[normalizedCategory] ?? 0
      merged.byCategory[normalizedCategory] = Math.max(currentCount, numericCount)
    }
  }

  merged.total = Object.values(merged.byCategory).reduce((acc, value) => acc + value, 0)

  if (evaluationSummary?.total != null && Number.isFinite(evaluationSummary.total)) {
    const candidateTotal = Math.max(merged.total, Math.round(evaluationSummary.total))
    merged.total = candidateTotal
  }

  return merged
}
