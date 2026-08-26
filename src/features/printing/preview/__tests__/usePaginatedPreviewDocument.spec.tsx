import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrintableDocument } from '../../types.ts'
import type { PaginatedDocument } from '../paginateDocumentForPreview.tsx'
import * as previewModule from '../paginateDocumentForPreview.tsx'

describe('usePaginatedPreviewDocument', () => {
  const baseDocument: PrintableDocument = {
    metadata: {
      examName: 'Sample Exam',
      taskCode: 'TEST_TASK',
      taskName: 'Sample Task',
      generatedAt: '2024-01-01T00:00:00.000Z',
    },
    settings: {
      includeAnswerKeyByDefault: false,
    },
    pages: [
      {
        id: 'student-page',
        role: 'student',
        orientation: 'portrait',
        sections: [],
      },
      {
        id: 'answer-key-page',
        role: 'answer-key',
        orientation: 'portrait',
        sections: [],
      },
    ],
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('filters answer-key pages when pagination fails and the toggle is disabled', async () => {
    vi.spyOn(previewModule, 'paginateDocumentForPreview').mockRejectedValueOnce(new Error('pagination failed'))

    const { result } = renderHook(() =>
      previewModule.usePaginatedPreviewDocument(baseDocument, false),
    )

    await waitFor(() => {
      expect(result.current.isPaginating).toBe(false)
    })

    expect(result.current.paginatedDocument).not.toBeNull()
    const answerKeyPages = result.current.paginatedDocument?.pages.filter((page) => page.role === 'answer-key')
    expect(answerKeyPages).toHaveLength(0)
  })

  it('retains answer-key pages in the fallback when the toggle is enabled', async () => {
    vi.spyOn(previewModule, 'paginateDocumentForPreview').mockRejectedValueOnce(new Error('pagination failed'))

    const { result } = renderHook(() =>
      previewModule.usePaginatedPreviewDocument(baseDocument, true),
    )

    await waitFor(() => {
      expect(result.current.isPaginating).toBe(false)
    })

    const answerKeyPages = result.current.paginatedDocument?.pages.filter((page) => page.role === 'answer-key')
    expect(answerKeyPages).toHaveLength(1)
    expect(answerKeyPages?.[0]?.id).toBe('answer-key-page')
  })

  it('resets the paginating flag when the source document is cleared mid-flight', async () => {
    let resolvePagination: (value: PaginatedDocument) => void
    const pendingPagination = new Promise<PaginatedDocument>((resolve) => {
      resolvePagination = resolve
    })

    vi.spyOn(previewModule, 'paginateDocumentForPreview').mockReturnValueOnce(pendingPagination)

    const { result, rerender } = renderHook(
      ({ document }) => previewModule.usePaginatedPreviewDocument(document, true),
      { initialProps: { document: baseDocument } },
    )

    await waitFor(() => {
      expect(result.current.isPaginating).toBe(true)
    })

    rerender({ document: null })

    await waitFor(() => {
      expect(result.current.isPaginating).toBe(false)
    })

    resolvePagination?.({
      metadata: baseDocument.metadata,
      settings: baseDocument.settings,
      pages: [],
    })
  })
})
