import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { MistakeAnchorResolution, MistakeItemPreview, MistakesAnalysisState } from '@/hooks/mistakes/types.ts'
import { MistakesAnalysisCard } from '../MistakesAnalysisCard.tsx'

type MistakeItemPreviewWithResolution = MistakeItemPreview & { anchorResolution: MistakeAnchorResolution }

const { mistakesAnalysisMock } = vi.hoisted(() => ({
  mistakesAnalysisMock: vi.fn(),
}))

vi.mock('@/hooks/mistakes/useMistakesAnalysis', () => ({
  default: (submissionId: string, options?: unknown) => mistakesAnalysisMock(submissionId, options),
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const renderCard = () => {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MistakesAnalysisCard submissionId="submission-1" canRegenerate={false} />
    </QueryClientProvider>,
  )
}

const baseState: MistakesAnalysisState = {
  submissionText: 'This wrong text has issues.',
  groups: [],
  loading: false,
  error: null,
  refetch: null,
  status: 'completed',
  summaryCounts: { total: 0, byCategory: {} },
  warnings: { unhighlightableItems: 0, discardedItems: 0, unparsedItems: 0 },
  lastErrorMessage: null,
}

const ambiguousItem: MistakeItemPreviewWithResolution = {
  id: 'v2-1',
  anchorText: 'unclear phrase',
  anchorPatch: { before: 'unclear phrase', after: null, contextBefore: '', contextAfter: '' },
  anchorResolution: { status: 'ambiguous' },
  explanation: 'Clarify the phrasing for accuracy.',
  categoryCode: 'GR',
  featureTags: ['TENSE_SHIFT'],
  suggestedCorrection: null,
  anchorStart: null,
  anchorEnd: null,
  anchorAdjustment: null,
}

const anchoredItem: MistakeItemPreviewWithResolution = {
  id: 'v2-anchored',
  anchorText: 'wrong',
  anchorPatch: { before: 'wrong', after: null, contextBefore: '', contextAfter: '' },
  anchorResolution: { status: 'anchored', start: 5, end: 10 },
  explanation: 'Fix the word choice.',
  categoryCode: 'GR',
  featureTags: [],
  suggestedCorrection: null,
  anchorStart: 5,
  anchorEnd: 10,
  anchorAdjustment: null,
}

const notFoundItem: MistakeItemPreviewWithResolution = {
  id: 'v2-unanchored',
  anchorText: 'missing',
  anchorPatch: { before: 'missing', after: null, contextBefore: '', contextAfter: '' },
  anchorResolution: { status: 'not_found' },
  explanation: 'Missing anchor.',
  categoryCode: 'GR',
  featureTags: [],
  suggestedCorrection: null,
  anchorStart: null,
  anchorEnd: null,
  anchorAdjustment: null,
}

describe('MistakesAnalysisCard v2 degradable UX', () => {
  beforeEach(() => {
    mistakesAnalysisMock.mockReset()
  })

  it('renders the list with unanchored items and shows warning badges', () => {
    const analysis: MistakesAnalysisState = {
      ...baseState,
      status: 'completed_with_warnings',
      summaryCounts: { total: 1, byCategory: { GR: 1 } },
      warnings: { unhighlightableItems: 1, discardedItems: 0, unparsedItems: 0 },
      groups: [
        {
          categoryCode: 'GR',
          categoryName: 'Grammar',
          count: 1,
          tags: [{ tagCode: 'TENSE_SHIFT', count: 1 }],
          items: [ambiguousItem],
        },
      ],
    }

    mistakesAnalysisMock.mockReturnValue(analysis)

    renderCard()

    expect(screen.getByText(/unclear phrase/i)).toBeInTheDocument()
    expect(screen.getByText(/no highlight: ambiguous match/i)).toBeInTheDocument()
    expect(screen.getByText(/some items could not be highlighted/i)).toBeInTheDocument()
    expect(screen.getByText(/1 item was not highlightable in the submission text/i)).toBeInTheDocument()
  })

  it('ignores unanchored items when rendering submission highlights', () => {
    const analysis: MistakesAnalysisState = {
      ...baseState,
      status: 'completed_with_warnings',
      summaryCounts: { total: 2, byCategory: { GR: 2 } },
      warnings: { unhighlightableItems: 1, discardedItems: 0, unparsedItems: 0 },
      groups: [
        {
          categoryCode: 'GR',
          categoryName: 'Grammar',
          count: 2,
          tags: [],
          items: [anchoredItem, notFoundItem],
        },
      ],
    }

    mistakesAnalysisMock.mockReturnValue(analysis)

    const { container } = renderCard()

    const highlights = container.querySelectorAll('mark')
    expect(highlights).toHaveLength(1)
    expect(highlights[0]?.textContent).toBe('wrong')
  })

  it('shows a specific warning when items were discarded and nothing is listable', () => {
    const analysis: MistakesAnalysisState = {
      ...baseState,
      status: 'completed_with_warnings',
      groups: [],
      summaryCounts: { total: 0, byCategory: {} },
      warnings: { unhighlightableItems: 0, discardedItems: 3, unparsedItems: 0 },
    }

    mistakesAnalysisMock.mockReturnValue(analysis)

    renderCard()

    expect(screen.getByText(/analysis completed with warnings/i)).toBeInTheDocument()
    expect(screen.getByText(/3 discarded/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /regenerate mistakes analysis/i })).not.toBeInTheDocument()
    expect(screen.getByText(/contact your teacher or academy team/i)).toBeInTheDocument()
    expect(screen.queryByText(/no mistakes detected/i)).not.toBeInTheDocument()
  })

  it('allows an authorized academy team member to regenerate a warning result', () => {
    mistakesAnalysisMock.mockReturnValue({
      ...baseState,
      status: 'completed_with_warnings',
      warnings: { unhighlightableItems: 0, discardedItems: 1, unparsedItems: 0 },
    })

    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MistakesAnalysisCard submissionId="submission-1" canRegenerate />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('button', { name: /regenerate mistakes analysis/i })).toBeInTheDocument()
    expect(screen.queryByText(/contact your teacher or academy team/i)).not.toBeInTheDocument()
  })
})
