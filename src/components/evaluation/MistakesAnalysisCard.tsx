import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area.tsx'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Button } from '@/components/ui/button.tsx'
import { CopyToClipboardButton } from '@/components/ui/copy-to-clipboard-button.tsx'
import { useToast } from '@/components/ui/use-toast.ts'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils.ts'
import useMistakesAnalysis from '@/hooks/mistakes/useMistakesAnalysis.ts'
import { DEFAULT_CATEGORY_LABELS, isMistakeCategoryCode } from '@/hooks/mistakes/utils.ts'
import { type MistakeCategoryCode, type MistakeCategoryGroup, type MistakesAnalysisState } from '@/hooks/mistakes/types.ts'
import { buildHighlightSegments } from './highlightUtils.ts'
import {
  getDebugMistakesAnalysis,
  type MistakesAnalysisDebugPreset,
} from './mistakesAnalysisDebugData.ts'

interface MistakesAnalysisCardProps {
  submissionId: string
  debugPreset?: MistakesAnalysisDebugPreset | null
  isAuthorizedTeacher?: boolean
  canRegenerate?: boolean
}

type CardViewState = 'loading' | 'error' | 'empty' | 'ready'

function resolveViewState(analysis: MistakesAnalysisState): CardViewState {
  if (analysis.loading) return 'loading'
  if (analysis.error) return 'error'
  if (!analysis.groups.length) {
    return analysis.status === 'failed' ? 'error' : 'empty'
  }
  return 'ready'
}

const STATUS_META: Record<
  MistakesAnalysisState['status'],
  { label: string; tone: 'pending' | 'success' | 'destructive' | 'warning' }
> = {
  pending: { label: 'Processing', tone: 'pending' },
  failed: { label: 'Needs attention', tone: 'destructive' },
  completed: { label: 'Completed', tone: 'success' },
  completed_with_warnings: { label: 'Completed with warnings', tone: 'warning' },
}

const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  normalization_failed: 'We couldn’t finish processing the mistakes. Please try again.',
  short_submission_policy_violation: 'The analysis is only available for longer submissions. Please add more detail and retry.',
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function formatMistakesErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null
  const normalized = raw.trim()
  if (!normalized) return null
  const directMatch = FRIENDLY_ERROR_MESSAGES[normalized.toLowerCase()]
  if (directMatch) return directMatch
  if (normalized.includes(' ')) return normalized
  const pretty = normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
  return pretty || normalized
}

export function MistakesAnalysisCard({
  submissionId,
  debugPreset,
  isAuthorizedTeacher = false,
  canRegenerate,
}: MistakesAnalysisCardProps) {
  const debugEnabled = Boolean(import.meta.env.DEV && debugPreset)
  const e2eModelName = useMemo(() => {
    if (!import.meta.env.DEV) return null
    try {
      const params = new URLSearchParams(window.location.search)
      const raw = params.get('e2eModelName')
      return raw && raw.trim().length > 0 ? raw.trim() : null
    } catch {
      return null
    }
  }, [])

  const mockAnalysis = useMemo(() => {
    if (!debugEnabled || !debugPreset) return null
    try {
      return getDebugMistakesAnalysis(debugPreset)
    } catch (error) {
      console.error('Unable to load mistakes debug preset')
      return null
    }
  }, [debugEnabled, debugPreset])

  const baseAnalysis = useMistakesAnalysis(submissionId, { enabled: !debugEnabled })
  const analysis = mockAnalysis ?? baseAnalysis
  const viewState = resolveViewState(analysis)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const regenerateMistakes = useMutation({
    mutationKey: ['mistakes-analysis', 'regenerate', submissionId],
    mutationFn: async () => {
      const modelName =
        (import.meta.env.DEV && e2eModelName)
          ? e2eModelName
          : import.meta.env.DEV && typeof import.meta.env.VITE_E2E_MODEL_NAME === 'string' && import.meta.env.VITE_E2E_MODEL_NAME.trim()
            ? import.meta.env.VITE_E2E_MODEL_NAME.trim()
            : undefined

      const { data, error } = await supabase.functions.invoke('evaluate-submission', {
        body: { submissionId, force: true, modelName },
      })

      if (error) {
        const context = isPlainRecord(error.context) ? error.context : null
        const contextMessage = context
          ? (typeof context.message === 'string'
            ? context.message
            : typeof context.error_description === 'string'
              ? context.error_description
              : JSON.stringify(context))
          : null
        throw new Error(contextMessage ?? error.message)
      }

      if (!isPlainRecord(data)) {
        throw new Error('Unexpected response while regenerating the analysis.')
      }

      if (!('mistakesStatus' in data) || !('evaluation' in data) || !('mistakes' in data)) {
        throw new Error('Unexpected response while regenerating the analysis.')
      }

      return data
    },
    onMutate: () => {
      toast({
        title: 'Regenerating Mistakes Analysis',
        description: 'We are reprocessing the submission to refresh the analysis.',
      })
    },
    onSuccess: async () => {
      toast({ title: 'Mistakes analysis regenerated', description: 'The analysis has been updated successfully.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mistakes-analysis', submissionId] }),
        queryClient.invalidateQueries({ queryKey: ['teacher', 'evaluation', submissionId] }),
      ])
      await analysis.refetch?.()
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Could not regenerate mistakes.'
      toast({ title: 'Regeneration failed', description: message, variant: 'destructive' })
    },
  })

  const displayedStatus: MistakesAnalysisState['status'] = regenerateMistakes.isPending ? 'pending' : analysis.status
  const allowRegenerate = !debugEnabled && (
    isAuthorizedTeacher ||
    (typeof canRegenerate === 'boolean' ? canRegenerate : false)
  )
  const formattedLastErrorMessage = formatMistakesErrorMessage(analysis.lastErrorMessage)
  const resolvedErrorMessage = analysis.status === 'failed' && !analysis.error
    ? formattedLastErrorMessage
      ? `Mistakes analysis failed: ${formattedLastErrorMessage}`
      : 'The mistakes analysis failed to complete. Please try regenerating the analysis.'
    : analysis.error ?? 'Could not load mistakes.'
  const shouldRenderActionFooter = viewState !== 'loading' && allowRegenerate
  const shouldShowRegenerationGuidance = !allowRegenerate && (
    analysis.status === 'completed_with_warnings' || analysis.status === 'failed'
  )
  const shouldShowFailedWarning = Boolean(analysis.lastErrorMessage) && viewState === 'ready'

  useEffect(() => {
    if (analysis.groups.length === 0) {
      setActiveCategory(null)
      return
    }
    if (!activeCategory || !analysis.groups.some((group) => group.categoryCode === activeCategory)) {
      setActiveCategory(analysis.groups[0]?.categoryCode ?? null)
    }
  }, [analysis.groups, activeCategory])

  const activeGroup = useMemo<MistakeCategoryGroup | null>(() => {
    if (!activeCategory) return analysis.groups[0] ?? null
    return analysis.groups.find((group) => group.categoryCode === activeCategory) ?? null
  }, [activeCategory, analysis.groups])

  const { unhighlightableItems, discardedItems, unparsedItems } = analysis.warnings
  const discardedOrUnparsedCount = discardedItems + unparsedItems

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <CardTitle>Mistakes Analysis</CardTitle>
          <CardDescription>Review AI-detected mistakes and suggested corrections with contextual highlights.</CardDescription>
        </div>
        <StatusBadge status={displayedStatus} />
      </CardHeader>
      <CardContent className="space-y-6">
        {viewState === 'loading' && <LoadingState />}
        {viewState === 'error' && <ErrorState message={resolvedErrorMessage} onRetry={analysis.refetch} />}
        {viewState === 'empty' && <EmptyState status={analysis.status} warnings={analysis.warnings} />}
        {shouldShowFailedWarning && (
          <Alert variant="destructive">
            <AlertTitle>Latest mistakes analysis failed</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>We’re showing the last available mistakes while you retry the analysis.</p>
              {formattedLastErrorMessage && (
                <p className="text-xs text-destructive">Details: {formattedLastErrorMessage}</p>
              )}
            </AlertDescription>
          </Alert>
        )}
        {viewState === 'ready' && activeGroup && (
          <div className="space-y-6">
            <SummaryHeader analysis={analysis} />
            {unhighlightableItems > 0 && (
              <Alert>
                <AlertTitle>Some items could not be highlighted</AlertTitle>
                <AlertDescription>
                  {unhighlightableItems} {unhighlightableItems === 1 ? 'item was' : 'items were'} not highlightable in the submission text.
                </AlertDescription>
              </Alert>
            )}
            {discardedOrUnparsedCount > 0 && (
              <Alert>
                <AlertTitle>Some items could not be shown</AlertTitle>
                <AlertDescription>
                  {discardedOrUnparsedCount}{' '}
                  {discardedOrUnparsedCount === 1 ? 'item was' : 'items were'} discarded because the AI response did not match the expected format.
                </AlertDescription>
              </Alert>
            )}
            <CategoryTabs
              groups={analysis.groups}
              activeCategory={activeGroup.categoryCode}
              onCategoryChange={setActiveCategory}
            />
            {analysis.submissionText !== null && (
              <SubmissionHighlight submissionText={analysis.submissionText} items={activeGroup.items} />
            )}
            <MistakeItemsList group={activeGroup} />
          </div>
        )}
        {shouldRenderActionFooter && (
          <ActionFooter
            status={displayedStatus}
            lastErrorMessage={formattedLastErrorMessage}
            onRegenerate={() => regenerateMistakes.mutateAsync()}
            regenerating={regenerateMistakes.isPending}
            allowRegenerate={allowRegenerate}
          />
        )}
        {shouldShowRegenerationGuidance && (
          <p className="text-sm text-muted-foreground">
            Contact your teacher or academy team if this analysis needs to be regenerated.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: MistakesAnalysisState['status'] }) {
  const meta = STATUS_META[status]
  const toneClass =
    meta.tone === 'pending' || meta.tone === 'warning'
      ? 'border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-300/70 dark:bg-amber-950/40 dark:text-amber-100'
      : meta.tone === 'destructive'
        ? 'border border-destructive/40 bg-destructive/10 text-destructive'
        : 'border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-200/70 dark:bg-emerald-900/30 dark:text-emerald-200'

  return (
    <Badge
      className={cn(
        'self-start rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide shadow-sm md:self-auto',
        toneClass,
      )}
    >
      {meta.label}
    </Badge>
  )
}

function SummaryHeader({ analysis }: { analysis: MistakesAnalysisState }) {
  const total = analysis.summaryCounts.total
  const resolveCategoryLabel = (category: string): string => {
    const upperCased = category.toUpperCase()
    if (!isMistakeCategoryCode(upperCased)) {
      return category
    }
    const code = upperCased as MistakeCategoryCode
    const matchingGroup = analysis.groups.find((group) => group.categoryCode === code)
    return matchingGroup?.categoryName ?? DEFAULT_CATEGORY_LABELS[code] ?? category
  }
  return (
    <section className="rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Summary</p>
          <h3 className="text-2xl font-semibold text-foreground">
            {total > 0 ? `${total} ${total === 1 ? 'mistake detected' : 'mistakes detected'}` : 'No mistakes detected'}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(analysis.summaryCounts.byCategory).map(([category, count]) => (
            <Badge key={category} variant="secondary" className="rounded-md px-2.5 py-1 text-xs font-medium">
              <span className="font-semibold">{resolveCategoryLabel(category)}</span>
              <span className="ml-2 text-muted-foreground">{count}</span>
            </Badge>
          ))}
        </div>
      </div>
    </section>
  )
}

function CategoryTabs({
  groups,
  activeCategory,
  onCategoryChange,
}: {
  groups: MistakeCategoryGroup[]
  activeCategory: string
  onCategoryChange: (code: string) => void
}) {
  return (
    <Tabs value={activeCategory} onValueChange={onCategoryChange} className="w-full">
      <ScrollArea className="w-full">
        <TabsList className="inline-flex w-auto min-w-max gap-1.5 bg-transparent p-0">
          {groups.map((group) => (
            <TabsTrigger
              key={group.categoryCode}
              value={group.categoryCode}
              className="rounded-full border-0 px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-all duration-200 hover:bg-muted/50 hover:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span>{group.categoryName}</span>
                <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors duration-200 group-data-[state=active]:bg-primary/20 group-data-[state=active]:text-primary">
                  {group.count}
                </span>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>
        <ScrollBar orientation="horizontal" className="mt-2" />
      </ScrollArea>
      {groups.map((group) => (
        <TabsContent key={group.categoryCode} value={group.categoryCode} className="space-y-4">
          <TagSummary group={group} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function TagSummary({ group }: { group: MistakeCategoryGroup }) {
  if (!group.tags.length) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        No feature tags recorded for this category.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {group.tags.map((tag) => (
        <Badge key={tag.tagCode} variant="secondary" className="rounded-full bg-muted/40 px-3 py-1 text-xs font-medium hover:bg-muted/60 transition-colors">
          <span className="text-foreground">{tag.tagCode}</span>
          <span className="ml-2 text-muted-foreground">{tag.count}</span>
        </Badge>
      ))}
    </div>
  )
}

function MistakeItemsList({ group }: { group: MistakeCategoryGroup }) {
  if (!group.items.length) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
        No mistakes recorded for this category.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {group.items.map((item) => {
        const trimmedExplanation = item.explanation.trim()
        const adjustment = item.anchorAdjustment ?? null
        const realignmentStatus = adjustment?.realignmentStatus ?? null
        const realignmentNotes = adjustment?.realignmentNotes ?? null
        const anchorStatus = item.anchorResolution.status
        const highlightBadgeLabel = (() => {
          if (anchorStatus === 'anchored') return null
          if (anchorStatus === 'ambiguous') return 'No highlight: ambiguous match'
          if (anchorStatus === 'not_found') return 'No highlight: not found'
          return 'No highlight: unavailable'
        })()
        const anchorLabel = anchorStatus === 'anchored' ? 'Highlighted span' : 'Reported span'
        const anchorText = item.anchorText || item.anchorPatch?.before || 'Span unavailable.'
        const adjustmentMessage = (() => {
          if (!adjustment || !realignmentStatus) return null

          switch (realignmentStatus) {
            case 'aligned': {
              const strategyLabel = adjustment.strategy === 'substring' ? 'substring match' : 'levenshtein distance'
              return (
                <>
                  Adjusted to match submission (strategy: {strategyLabel}, distance {adjustment.distance}). AI original span:{' '}
                  <span className="font-mono text-foreground">{adjustment.originalAnchorText}</span>.
                  {realignmentNotes ? (
                    <>
                      {' '}
                      Notes: <span className="font-mono text-foreground">{realignmentNotes}</span>.
                    </>
                  ) : null}
                </>
              )
            }
            case 'unchanged':
              return (
                <>
                  Span already matched the submission; keeping the original offsets.
                  {realignmentNotes ? (
                    <>
                      {' '}
                      Notes: <span className="font-mono text-foreground">{realignmentNotes}</span>.
                    </>
                  ) : null}
                </>
              )
            case 'not_found':
              return (
                <>
                  Realignment model could not confirm this span; using the stored offsets.
                  {realignmentNotes ? (
                    <>
                      {' '}
                      Notes: <span className="font-mono text-foreground">{realignmentNotes}</span>.
                    </>
                  ) : null}
                </>
              )
            case 'invalid':
              return (
                <>
                  Realignment suggestion was rejected; using the stored offsets.
                  {realignmentNotes ? (
                    <>
                      {' '}
                      Notes: <span className="font-mono text-foreground">{realignmentNotes}</span>.
                    </>
                  ) : null}
                </>
              )
            case 'skipped':
              return (
                <>
                  Realignment was skipped for this mistake; using the stored offsets.
                  {realignmentNotes ? (
                    <>
                      {' '}
                      Notes: <span className="font-mono text-foreground">{realignmentNotes}</span>.
                    </>
                  ) : null}
                </>
              )
            default:
              return null
          }
        })()

        return (
          <article
            key={item.id}
            id={`mistake-item-${item.id}`}
            className="rounded-lg border p-4 shadow-sm transition-colors hover:border-primary/40"
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-xs font-semibold">
                  {item.categoryCode}
                </Badge>
                {item.featureTags.map((tag) => (
                  <Badge key={tag} variant="outline" className="rounded-md px-2.5 py-1 text-xs uppercase tracking-wide">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {highlightBadgeLabel && (
                  <Badge variant="outline" className="rounded-md px-2.5 py-1 text-xs text-muted-foreground">
                    {highlightBadgeLabel}
                  </Badge>
                )}
                {item.suggestedCorrection && (
                  <Badge variant="outline" className="rounded-md px-2.5 py-1 text-xs text-primary">
                    Suggested fix available
                  </Badge>
                )}
              </div>
            </header>

            <section className="mt-4 space-y-3 text-sm">
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{anchorLabel}</p>
                <p className="mt-2 font-medium text-foreground">{anchorText}</p>
                {adjustmentMessage && (
                  <p className="mt-2 text-xs text-muted-foreground">{adjustmentMessage}</p>
                )}
              </div>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explanation</p>
                  {trimmedExplanation && (
                    <CopyToClipboardButton
                      value={trimmedExplanation}
                      tooltip="Copy explanation"
                      copiedTooltip="Copied"
                      ariaLabel={`Copy explanation for ${item.categoryCode} mistake`}
                      className="h-8 w-8 shrink-0"
                    />
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground">{item.explanation}</p>
              </div>
              {item.suggestedCorrection && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested correction</p>
                  <p className="mt-1 text-sm text-primary">{item.suggestedCorrection}</p>
                </div>
              )}
            </section>
          </article>
        )
      })}
    </div>
  )
}

function SubmissionHighlight({
  submissionText,
  items,
}: {
  submissionText: string
  items: MistakeCategoryGroup['items']
}) {
  const trimmedText = submissionText.trim()
  const segments = useMemo(() => {
    if (trimmedText.length === 0) {
      return []
    }
    return buildHighlightSegments(submissionText, items)
  }, [submissionText, items, trimmedText])
  const mistakeMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  if (trimmedText.length === 0) {
    return (
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submission highlight</p>
        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          Submission text is not available for highlighting.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submission highlight</p>
      <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
        <span className="whitespace-pre-wrap">
          {segments.map((segment) => {
            if (segment.mistakeIds.length === 0) {
              return (
                <span key={`${segment.start}-${segment.end}-plain`}>
                  {segment.text}
                </span>
              )
            }

            const labelParts = segment.mistakeIds
              .map((id) => mistakeMap.get(id))
              .filter((entry): entry is MistakeCategoryGroup['items'][number] => Boolean(entry))
              .map((mistake) => {
                const tags = mistake.featureTags.length > 0 ? ` – ${mistake.featureTags.join(', ')}` : ''
                return `${mistake.categoryCode}${tags}`
              })

            const ariaLabel = labelParts.length > 0
              ? `Mistake highlight: ${labelParts.join('; ')}`
              : 'Mistake highlight'
            const describedBy = segment.mistakeIds.map((id) => `mistake-item-${id}`).join(' ') || undefined
            const isCompound = segment.mistakeIds.length > 1

            return (
              <mark
                key={`${segment.start}-${segment.end}-${segment.mistakeIds.join('-')}`}
                className={cn(
                  'rounded-sm px-1 py-0.5 text-foreground',
                  isCompound
                    ? 'bg-amber-300/70 ring-1 ring-amber-500/60 dark:bg-amber-400/30'
                    : 'bg-amber-200/70 dark:bg-amber-300/30',
                )}
                aria-label={ariaLabel}
                aria-describedby={describedBy}
              >
                {segment.text}
              </mark>
            )
          })}
        </span>
      </div>
    </section>
  )
}

function ActionFooter({
  status,
  lastErrorMessage,
  onRegenerate,
  regenerating,
  allowRegenerate,
}: {
  status: MistakesAnalysisState['status']
  lastErrorMessage: string | null
  onRegenerate: () => Promise<unknown>
  regenerating: boolean
  allowRegenerate: boolean
}) {
  if (!allowRegenerate) return null
  const isPending = status === 'pending'
  const isWarning = status === 'completed_with_warnings'
  const isCompleted = status === 'completed' || isWarning
  const hasLastError = Boolean(lastErrorMessage)
  const disableRegenerate = regenerating
  const supportMessage = isPending && !hasLastError
    ? 'The analysis is still pending. If it looks stuck, regenerate the analysis to retry.'
    : hasLastError
      ? 'The last attempt ran into an issue. Regenerate the analysis to try again.'
      : isWarning
        ? 'The analysis finished with warnings. Regenerate the analysis to try to recover discarded items.'
        : isCompleted
          ? 'Need a fresh run? Regenerate the mistakes analysis.'
          : 'Need to refresh the mistakes analysis? Regenerate the analysis to try again.'
  const buttonLabel = regenerating ? 'Regenerating…' : 'Regenerate Mistakes Analysis'
  return (
    <footer className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>{supportMessage}</p>
        {lastErrorMessage && <p className="text-xs text-destructive">Last error: {lastErrorMessage}</p>}
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={disableRegenerate}
        onClick={() => {
          void onRegenerate()
        }}
        className={cn('w-full justify-center md:w-auto')}
      >
        {regenerating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {buttonLabel}
      </Button>
    </footer>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: MistakesAnalysisState['refetch'] }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Unable to load mistakes</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{message}</span>
        {onRetry && (
          <Button size="sm" variant="outline" className="self-start" onClick={() => onRetry()}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function EmptyState({
  status,
  warnings,
}: {
  status: MistakesAnalysisState['status']
  warnings: MistakesAnalysisState['warnings']
}) {
  if (status === 'pending') {
    return (
      <Alert>
        <AlertTitle>Analysis in progress</AlertTitle>
        <AlertDescription>The mistakes analysis is still running. Check back in a moment.</AlertDescription>
      </Alert>
    )
  }

  if (status === 'completed_with_warnings') {
    const unhighlightable = warnings.unhighlightableItems
    const discarded = warnings.discardedItems
    const unparsed = warnings.unparsedItems
    const details = [
      discarded > 0 ? `${discarded} discarded` : null,
      unparsed > 0 ? `${unparsed} could not be parsed` : null,
      unhighlightable > 0 ? `${unhighlightable} could not be highlighted` : null,
    ].filter((entry): entry is string => Boolean(entry))

    return (
      <Alert>
        <AlertTitle>Analysis completed with warnings</AlertTitle>
        <AlertDescription>
          {details.length > 0
            ? `We couldn’t show all detected items (${details.join(', ')}). Try regenerating the analysis to recover them.`
            : 'We couldn’t show all detected items. Try regenerating the analysis to recover them.'}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert>
      <AlertTitle>No mistakes detected</AlertTitle>
      <AlertDescription>
        The AI didn’t flag any mistakes for this submission. Encourage the student to double-check their work manually if
        needed.
      </AlertDescription>
    </Alert>
  )
}

export default MistakesAnalysisCard
