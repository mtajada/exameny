import '@/vite-types.ts'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/integrations/supabase/types.ts'
import {
  type MistakeAnchorPatch,
  type MistakeAnchorResolution,
  type MistakeAmbiguousStrategy,
  type MistakeCategoryCode,
  type MistakeCategoryGroup,
  type MistakeAnchoredStrategy,
  type MistakeFeatureTagSummary,
  type MistakeItemPreview,
  type MistakeNotFoundStrategy,
  type MistakesAnalysisState,
  type MistakesStatus,
} from './types.ts'
import {
  buildMistakeGroups,
  buildMistakeGroupsFromItems,
  computeSummaryFromGroups,
  mergeSummaryCounts,
  normalizeCategoryCode,
  type SupabaseMistakeRow,
} from './utils.ts'

interface MistakesTableDefinitions {
  error_categories: {
    Row: {
      id: number
      code: string
      name: string
      description: string
    }
    Insert: {
      id?: number
      code: string
      name: string
      description: string
    }
    Update: {
      id?: number
      code?: string
      name?: string
      description?: string
    }
    Relationships: []
  }
  error_tags: {
    Row: {
      id: number
      category_id: number
      code: string
      name: string
      description: string
      skills: string[]
    }
    Insert: {
      id?: number
      category_id: number
      code: string
      name: string
      description: string
      skills?: string[]
    }
    Update: {
      id?: number
      category_id?: number
      code?: string
      name?: string
      description?: string
      skills?: string[]
    }
    Relationships: [
      {
        foreignKeyName: 'error_tags_category_id_fkey'
        columns: ['category_id']
        isOneToOne: false
        referencedRelation: 'error_categories'
        referencedColumns: ['id']
      },
    ]
  }
  mistakes: {
    Row: {
      id: string
      student_id: string
      task_type_id: number
      source: string
      writing_submission_id: string
      anchor_text: string
      anchor_start: number
      anchor_end: number
      suggested_correction: string | null
      explanation: string
      category_id: number
      tag_id: number | null
      meta: Json
      created_at: string
      updated_at: string
    }
    Insert: {
      id?: string
      student_id: string
      task_type_id: number
      source?: string
      writing_submission_id: string
      anchor_text: string
      anchor_start: number
      anchor_end: number
      suggested_correction?: string | null
      explanation: string
      category_id: number
      tag_id?: number | null
      meta?: Json
      created_at?: string
      updated_at?: string
    }
    Update: {
      id?: string
      student_id?: string
      task_type_id?: number
      source?: string
      writing_submission_id?: string
      anchor_text?: string
      anchor_start?: number
      anchor_end?: number
      suggested_correction?: string | null
      explanation?: string
      category_id?: number
      tag_id?: number | null
      meta?: Json
      created_at?: string
      updated_at?: string
    }
    Relationships: [
      {
        foreignKeyName: 'mistakes_category_id_fkey'
        columns: ['category_id']
        isOneToOne: false
        referencedRelation: 'error_categories'
        referencedColumns: ['id']
      },
      {
        foreignKeyName: 'mistakes_student_id_fkey'
        columns: ['student_id']
        isOneToOne: false
        referencedRelation: 'profiles'
        referencedColumns: ['id']
      },
      {
        foreignKeyName: 'mistakes_tag_id_fkey'
        columns: ['tag_id']
        isOneToOne: false
        referencedRelation: 'error_tags'
        referencedColumns: ['id']
      },
      {
        foreignKeyName: 'mistakes_task_type_id_fkey'
        columns: ['task_type_id']
        isOneToOne: false
        referencedRelation: 'exam_task_types'
        referencedColumns: ['id']
      },
      {
        foreignKeyName: 'mistakes_writing_submission_id_fkey'
        columns: ['writing_submission_id']
        isOneToOne: false
        referencedRelation: 'submissions'
        referencedColumns: ['id']
      },
      {
        foreignKeyName: 'mistakes_submission_task_type_fk'
        columns: ['writing_submission_id', 'task_type_id']
        isOneToOne: false
        referencedRelation: 'submissions'
        referencedColumns: ['id', 'task_type_id']
      },
    ]
  }
}

type MistakesDatabase = Database & {
  public: Database['public'] & {
    Tables: Database['public']['Tables'] & MistakesTableDefinitions
  }
}

type MistakesSupabaseClient = SupabaseClient<MistakesDatabase>

const mistakesSupabase = supabase as MistakesSupabaseClient

function isViteFlagEnabled(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

const MISTAKES_V2_ENABLED = import.meta.env.DEV && isViteFlagEnabled(import.meta.env.VITE_MISTAKES_V2)

type EvaluationSummary = Partial<{
  byCategory: Record<string, number>
  byTag: Record<string, number>
  total: number
}>

interface EvaluationRow {
  ai_mistakes_status: string | null
  ai_mistakes_error: string | null
  ai_mistakes_summary: EvaluationSummary | null
  ai_mistakes_items_v2: Json | null
  ai_mistakes_metrics_v2: Json | null
}

interface SubmissionRow {
  submission_text: string | null
}

interface QueryResult {
  submissionText: string | null
  groups: MistakeCategoryGroup[]
  status: MistakesStatus
  summaryCounts: MistakesAnalysisState['summaryCounts']
  warnings: MistakesAnalysisState['warnings']
  lastErrorMessage: string | null
}

interface MistakeRowRecord {
  id: string
  anchor_text: string
  anchor_start: number
  anchor_end: number
  suggested_correction: string | null
  explanation: string
  meta: Record<string, unknown> | null
  category_id: number
  tag_id: number | null
}

interface ErrorCategoryRow {
  id: number
  code: string | null
  name: string | null
}

interface ErrorTagRow {
  id: number
  code: string | null
  name: string | null
}

type DbMistakesStatus = 'pending' | 'failed' | 'completed'

function normalizeDbStatus(raw: string | null | undefined): DbMistakesStatus {
  if (raw === 'failed') return 'failed'
  if (raw === 'completed') return 'completed'
  return 'pending'
}

export function deriveMistakesStatus({
  dbStatus,
  hasV2Items,
  warningCount,
  unhighlightableCount,
}: {
  dbStatus: DbMistakesStatus
  hasV2Items: boolean
  warningCount?: number
  unhighlightableCount?: number
}): MistakesStatus {
  const resolvedWarningCount = warningCount ?? unhighlightableCount ?? 0
  if (dbStatus === 'pending') return 'pending'
  if (dbStatus === 'failed') {
    return hasV2Items ? 'completed_with_warnings' : 'failed'
  }
  if (hasV2Items && resolvedWarningCount > 0) {
    return 'completed_with_warnings'
  }
  return 'completed'
}

function parseEvaluationSummary(candidate: unknown): EvaluationSummary {
  if (!isPlainRecord(candidate)) return {}
  const source = candidate
  const result: EvaluationSummary = {}

  if (isPlainRecord(source.byCategory)) {
    const entries = Object.entries(source.byCategory)
    result.byCategory = entries.reduce<Record<string, number>>((acc, [rawKey, rawValue]) => {
      const key = typeof rawKey === 'string' ? rawKey : String(rawKey)
      const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0
      acc[key] = value
      return acc
    }, {})
  }

  if (isPlainRecord(source.byTag)) {
    const entries = Object.entries(source.byTag)
    result.byTag = entries.reduce<Record<string, number>>((acc, [rawKey, rawValue]) => {
      const key = typeof rawKey === 'string' ? rawKey : String(rawKey)
      const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0
      acc[key] = value
      return acc
    }, {})
  }

  const totalCandidate = source.total
  if (typeof totalCandidate === 'number' && Number.isFinite(totalCandidate)) {
    result.total = totalCandidate
  }

  return result
}

function mapMistakeRows(rows: SupabaseMistakeRow[]): MistakeCategoryGroup[] {
  return buildMistakeGroups(rows)
}

function isPlainRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
}

interface MistakesMetricsV2 {
  total?: number
  anchored?: number
  ambiguous?: number
  not_found?: number
  invalid?: number
  resolverDurationMs?: number
  resolverVersion?: number
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeStringArray(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) return []
  const entries = candidate
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => item.toUpperCase())
  return Array.from(new Set(entries))
}

function parseAnchorPatch(candidate: unknown): MistakeAnchorPatch | null {
  if (!isPlainRecord(candidate)) return null
  const before = typeof candidate.before === 'string' ? candidate.before : null
  if (!before || before.trim().length === 0) return null
  const after = candidate.after === null ? null : normalizeOptionalText(candidate.after)
  const contextBefore = typeof candidate.contextBefore === 'string' ? candidate.contextBefore : ''
  const contextAfter = typeof candidate.contextAfter === 'string' ? candidate.contextAfter : ''
  return {
    before,
    after,
    contextBefore,
    contextAfter,
  }
}

const ANCHORED_STRATEGIES = new Set<MistakeAnchoredStrategy>([
  'legacy_offsets',
  'composite',
  'before_unique',
  'context_score',
  'whitespace',
])

const AMBIGUOUS_STRATEGIES = new Set<MistakeAmbiguousStrategy>([
  'context_score',
  'before_multiple',
])

const NOT_FOUND_STRATEGIES = new Set<MistakeNotFoundStrategy>([
  'composite',
  'before',
  'whitespace',
])

function warnUnknownStrategy(_status: string, _strategy: string) {
  if (!import.meta.env.DEV) return
  console.warn('[mistakes-v2] Unknown anchor resolution strategy.')
}

function parseAnchorResolution(candidate: unknown): MistakeAnchorResolution {
  if (!isPlainRecord(candidate)) {
    return { status: 'invalid', reason: 'missing_resolution' }
  }
  const status = candidate.status
  if (status === 'anchored') {
    const start = typeof candidate.start === 'number' && Number.isFinite(candidate.start) ? candidate.start : null
    const end = typeof candidate.end === 'number' && Number.isFinite(candidate.end) ? candidate.end : null
    if (start === null || end === null) {
      return { status: 'invalid', reason: 'missing_offsets' }
    }
    const resolution: MistakeAnchorResolution = { status: 'anchored', start, end }
    if (typeof candidate.strategy === 'string') {
      if (ANCHORED_STRATEGIES.has(candidate.strategy as MistakeAnchoredStrategy)) {
        resolution.strategy = candidate.strategy as MistakeAnchoredStrategy
      } else {
        warnUnknownStrategy('anchored', candidate.strategy)
      }
    }
    if (typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)) {
      resolution.confidence = candidate.confidence
    }
    return resolution
  }
  if (status === 'ambiguous') {
    const resolution: MistakeAnchorResolution = { status: 'ambiguous' }
    if (typeof candidate.strategy === 'string') {
      if (AMBIGUOUS_STRATEGIES.has(candidate.strategy as MistakeAmbiguousStrategy)) {
        resolution.strategy = candidate.strategy as MistakeAmbiguousStrategy
      } else {
        warnUnknownStrategy('ambiguous', candidate.strategy)
      }
    }
    if (typeof candidate.candidates === 'number' && Number.isFinite(candidate.candidates)) {
      resolution.candidates = candidate.candidates
    }
    return resolution
  }
  if (status === 'not_found') {
    const resolution: MistakeAnchorResolution = { status: 'not_found' }
    if (typeof candidate.strategy === 'string') {
      if (NOT_FOUND_STRATEGIES.has(candidate.strategy as MistakeNotFoundStrategy)) {
        resolution.strategy = candidate.strategy as MistakeNotFoundStrategy
      } else {
        warnUnknownStrategy('not_found', candidate.strategy)
      }
    }
    return resolution
  }
  if (status === 'invalid') {
    const reason = typeof candidate.reason === 'string' ? candidate.reason : undefined
    return { status: 'invalid', reason }
  }
  return { status: 'invalid', reason: 'unknown_status' }
}

function normalizeMetricCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.round(value))
}

function parseMetricsV2(candidate: unknown): MistakesMetricsV2 {
  if (!isPlainRecord(candidate)) return {}
  return {
    total: normalizeMetricCount(candidate.total),
    anchored: normalizeMetricCount(candidate.anchored),
    ambiguous: normalizeMetricCount(candidate.ambiguous),
    not_found: normalizeMetricCount(candidate.not_found),
    invalid: normalizeMetricCount(candidate.invalid),
    resolverDurationMs: normalizeMetricCount(candidate.resolverDurationMs),
    resolverVersion: normalizeMetricCount(candidate.resolverVersion),
  }
}

function parseMistakeV2Item(
  candidate: unknown,
  submissionText: string | null,
  index: number,
): MistakeItemPreview | null {
  if (!isPlainRecord(candidate)) return null
  const categoryRaw = typeof candidate.category === 'string' ? candidate.category : null
  if (!categoryRaw) return null

  const anchorPatch = parseAnchorPatch(candidate.anchorPatch)
  if (!anchorPatch) return null

  const explanation = normalizeOptionalText(candidate.explanation)
  if (!explanation) return null

  const meta = isPlainRecord(candidate.meta) ? candidate.meta : null
  const featureTags = normalizeStringArray(candidate.featureTags)
  const resolvedTags = featureTags.length > 0 ? featureTags : normalizeStringArray(meta?.feature_tags)

  const anchorResolution = parseAnchorResolution(candidate.anchorResolution)
  let resolvedAnchorResolution = anchorResolution

  let anchorStart: number | null = null
  let anchorEnd: number | null = null
  let anchorText = anchorPatch.before

  if (anchorResolution.status === 'anchored') {
    const start = anchorResolution.start
    const end = anchorResolution.end
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      resolvedAnchorResolution = { status: 'invalid', reason: 'missing_offsets' }
    } else if (typeof submissionText === 'string') {
      if (start < 0 || end > submissionText.length || end <= start) {
        resolvedAnchorResolution = { status: 'invalid', reason: 'out_of_bounds' }
      } else {
        anchorStart = start
        anchorEnd = end
        anchorText = submissionText.slice(start, end)
      }
    } else {
      anchorStart = start
      anchorEnd = end
      anchorText = anchorPatch.before
    }
  }

  const categoryCode = normalizeCategoryCode(categoryRaw)
  const suggestedCorrection = anchorPatch.after ?? normalizeOptionalText(candidate.suggestedCorrection) ?? null
  const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0
    ? candidate.id.trim()
    : `v2-${index + 1}`

  return {
    id,
    anchorText,
    anchorPatch,
    anchorResolution: resolvedAnchorResolution,
    explanation,
    categoryCode,
    featureTags: resolvedTags,
    suggestedCorrection,
    anchorStart,
    anchorEnd,
    anchorAdjustment: null,
  }
}

function parseMistakeV2Items(candidate: unknown, submissionText: string | null): MistakeItemPreview[] | null {
  if (!Array.isArray(candidate)) return null
  const items: MistakeItemPreview[] = []
  candidate.forEach((entry, index) => {
    const parsed = parseMistakeV2Item(entry, submissionText, index)
    if (parsed) {
      items.push(parsed)
    }
  })
  return items
}

async function fetchMistakesAnalysis(submissionId: string): Promise<QueryResult> {
  const [evaluationQuery, submissionQuery] = await Promise.all([
    mistakesSupabase
      .from('evaluations')
      .select('ai_mistakes_status, ai_mistakes_error, ai_mistakes_summary, ai_mistakes_items_v2, ai_mistakes_metrics_v2')
      .eq('submission_id', submissionId)
      .maybeSingle<EvaluationRow>(),
    mistakesSupabase
      .from('submissions')
      .select('submission_text')
      .eq('id', submissionId)
      .maybeSingle<SubmissionRow>(),
  ])

  if (evaluationQuery.error) {
    throw new Error(evaluationQuery.error.message)
  }

  if (submissionQuery.error) {
    throw new Error(submissionQuery.error.message)
  }

  const evaluation = evaluationQuery.data ?? null
  const submission = submissionQuery.data ?? null
  const submissionText = submission?.submission_text ?? null

  const rawV2Items = MISTAKES_V2_ENABLED ? (evaluation?.ai_mistakes_items_v2 ?? null) : null
  const v2Items = parseMistakeV2Items(rawV2Items, submissionText)
  const hasV2Items = Array.isArray(rawV2Items)
  const rawV2Count = hasV2Items ? rawV2Items.length : 0
  const parsedV2Count = v2Items ? v2Items.length : 0
  const unparsedItems = Math.max(0, rawV2Count - parsedV2Count)

  const rawV2Metrics = MISTAKES_V2_ENABLED ? (evaluation?.ai_mistakes_metrics_v2 ?? null) : null
  const metrics = parseMetricsV2(rawV2Metrics)
  const itemsUnhighlightable = v2Items
    ? v2Items.filter((item) => item.anchorResolution.status !== 'anchored').length
    : 0

  const discardedItems = typeof metrics.total === 'number'
    ? Math.max(0, metrics.total - rawV2Count)
    : 0

  const warningCount = itemsUnhighlightable + discardedItems + unparsedItems

  const dbStatus = normalizeDbStatus(evaluation?.ai_mistakes_status ?? null)
  const status = deriveMistakesStatus({ dbStatus, hasV2Items, warningCount })
  const evaluationSummary = parseEvaluationSummary(evaluation?.ai_mistakes_summary)

  if (hasV2Items && v2Items) {
    const categoryNameByCode = new Map<MistakeCategoryCode, string>()
    const categoryCodes = Array.from(new Set(v2Items.map((item) => item.categoryCode)))
    if (categoryCodes.length > 0) {
      const categoriesQuery = await mistakesSupabase
        .from('error_categories')
        .select('id, code, name')
        .in('code', categoryCodes)

      if (categoriesQuery.error) {
        throw new Error(categoriesQuery.error.message)
      }

      const categories = ((categoriesQuery.data ?? []) as Partial<ErrorCategoryRow>[])
        .filter((category): category is ErrorCategoryRow => typeof category.id === 'number')
        .map((category) => ({
          id: category.id,
          code: category.code ?? null,
          name: category.name ?? null,
        }))
      for (const category of categories) {
        if (!category.code) continue
        const code = normalizeCategoryCode(category.code)
        if (category.name) {
          categoryNameByCode.set(code, category.name)
        }
      }
    }

    const groups = buildMistakeGroupsFromItems(v2Items, categoryNameByCode)
    const groupsSummary = computeSummaryFromGroups(groups)
    const mergedSummary = mergeSummaryCounts(groupsSummary, evaluationSummary)

	    return {
	      submissionText,
	      groups,
	      status,
	      summaryCounts: mergedSummary,
	      warnings: {
	        unhighlightableItems: itemsUnhighlightable,
	        discardedItems,
	        unparsedItems,
	      },
	      lastErrorMessage: evaluation?.ai_mistakes_error ?? null,
	    }
	  }

  const mistakesQuery = await mistakesSupabase
    .from('mistakes')
    .select(
      'id, anchor_text, anchor_start, anchor_end, suggested_correction, explanation, meta, category_id, tag_id',
    )
    .eq('writing_submission_id', submissionId)
    .order('anchor_start', { ascending: true })

  if (mistakesQuery.error) {
    throw new Error(mistakesQuery.error.message)
  }

  const mistakeRows = (mistakesQuery.data ?? []) as MistakeRowRecord[]

  const uniqueCategoryIds = Array.from(
    new Set(
      mistakeRows
        .map((row) => row.category_id)
        .filter((categoryId): categoryId is number => typeof categoryId === 'number' && Number.isFinite(categoryId)),
    ),
  )
  const uniqueTagIds = Array.from(
    new Set(
      mistakeRows
        .map((row) => row.tag_id)
        .filter((tagId): tagId is number => typeof tagId === 'number' && Number.isFinite(tagId)),
    ),
  )

  let categoriesMap = new Map<number, ErrorCategoryRow>()
  if (uniqueCategoryIds.length > 0) {
    const categoriesQuery = await mistakesSupabase
      .from('error_categories')
      .select('id, code, name')
      .in('id', uniqueCategoryIds)

    if (categoriesQuery.error) {
      throw new Error(categoriesQuery.error.message)
    }

    const categories = ((categoriesQuery.data ?? []) as Partial<ErrorCategoryRow>[])
      .filter((category): category is ErrorCategoryRow => typeof category.id === 'number')
      .map((category) => ({
        id: category.id,
        code: category.code ?? null,
        name: category.name ?? null,
      }))
    categoriesMap = new Map(
      categories.map((category) => [category.id, category]),
    )
  }

  let tagsMap = new Map<number, ErrorTagRow>()
  if (uniqueTagIds.length > 0) {
    const tagsQuery = await mistakesSupabase.from('error_tags').select('id, code, name').in('id', uniqueTagIds)

    if (tagsQuery.error) {
      throw new Error(tagsQuery.error.message)
    }

    const tags = ((tagsQuery.data ?? []) as Partial<ErrorTagRow>[])
      .filter((tag): tag is ErrorTagRow => typeof tag.id === 'number')
      .map((tag) => ({
        id: tag.id,
        code: tag.code ?? null,
        name: tag.name ?? null,
      }))
    tagsMap = new Map(tags.map((tag) => [tag.id, tag]))
  }

  const mistakes: SupabaseMistakeRow[] = mistakeRows.map((row) => {
    const categoryRecord = categoriesMap.get(row.category_id) ?? null
    const tagRecord = row.tag_id != null ? tagsMap.get(row.tag_id) ?? null : null
    const meta = isPlainRecord(row.meta) ? row.meta : null

    return {
      id: row.id,
      anchor_text: row.anchor_text,
      anchor_start: row.anchor_start,
      anchor_end: row.anchor_end,
      suggested_correction: row.suggested_correction ?? null,
      explanation: row.explanation,
      meta,
      category: categoryRecord ? { code: categoryRecord.code ?? null, name: categoryRecord.name ?? null } : null,
      tag: tagRecord ? { code: tagRecord.code ?? null, name: tagRecord.name ?? null } : null,
    }
  })

  const groups = mapMistakeRows(mistakes)
  const groupsSummary = computeSummaryFromGroups(groups)
  const mergedSummary = mergeSummaryCounts(groupsSummary, evaluationSummary)

	  return {
	    submissionText,
	    groups,
	    status,
	    summaryCounts: mergedSummary,
	    warnings: {
	      unhighlightableItems: 0,
	      discardedItems: 0,
	      unparsedItems: 0,
	    },
	    lastErrorMessage: evaluation?.ai_mistakes_error ?? null,
	  }
}

function extractErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error loading mistakes analysis.'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error loading mistakes analysis.'
  }
}

interface UseMistakesAnalysisOptions {
  enabled?: boolean
}

export function useMistakesAnalysis(
  submissionId: string,
  options: UseMistakesAnalysisOptions = {},
): MistakesAnalysisState {
  const query = useQuery({
    queryKey: ['mistakes-analysis', submissionId],
    enabled: Boolean(submissionId) && options.enabled !== false,
    staleTime: 1000 * 30,
    queryFn: () => {
      if (!submissionId) {
        throw new Error('Submission identifier is required to load mistakes analysis.')
      }
      return fetchMistakesAnalysis(submissionId)
    },
  })

	  return useMemo<MistakesAnalysisState>(() => ({
	    submissionText: query.data?.submissionText ?? null,
	    groups: query.data?.groups ?? [],
	    loading: query.isLoading,
	    error: query.error ? extractErrorMessage(query.error) : null,
	    refetch: query.refetch,
	    status: query.data?.status ?? 'pending',
	    summaryCounts: query.data?.summaryCounts ?? { total: 0, byCategory: {} },
	    warnings: query.data?.warnings ?? { unhighlightableItems: 0, discardedItems: 0, unparsedItems: 0 },
	    lastErrorMessage: query.data?.lastErrorMessage ?? null,
	  }), [
	    query.data?.groups,
	    query.data?.lastErrorMessage,
	    query.data?.status,
	    query.data?.submissionText,
	    query.data?.summaryCounts,
	    query.data?.warnings,
	    query.error,
	    query.isLoading,
	    query.refetch,
	  ])
}

export default useMistakesAnalysis

export type {
  MistakeCategoryGroup,
  MistakeFeatureTagSummary,
  MistakeItemPreview,
  MistakesAnalysisState,
  MistakesStatus,
  UseMistakesAnalysisOptions,
}
