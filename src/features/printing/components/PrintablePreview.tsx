import { useEffect, useRef } from 'react'
import { usePaginatedPreviewDocument } from '../preview/paginateDocumentForPreview.tsx'
import type { PrintableDocument } from '../types.ts'
import { PrintableExerciseDocument } from './PrintableExerciseDocument.tsx'

interface PrintablePreviewProps {
  document: PrintableDocument
  includeAnswerKey: boolean
}

export const PrintablePreview = ({ document, includeAnswerKey }: PrintablePreviewProps) => {
  const { paginatedDocument, isPaginating } = usePaginatedPreviewDocument(document, includeAnswerKey)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const resolvedDocument = paginatedDocument ?? {
    ...document,
    pages: document.pages.filter((page) => includeAnswerKey || page.role !== 'answer-key'),
  }

  useEffect(() => {
    if (import.meta.env.PROD) return
    if (typeof globalThis.document === 'undefined') return
    if (!paginatedDocument) return
    if (isPaginating) return

    const frame = requestAnimationFrame(() => {
      const container = wrapperRef.current
      if (!container) return
      const contents = container.querySelectorAll<HTMLElement>('.printable-page__content')
      contents.forEach((content, index) => {
        const overflow = content.scrollHeight - content.clientHeight
        if (overflow > 1.5) {
          const page = index + 1
          const overflowPx = Number(overflow.toFixed(2))
          console.warn('[printing] Preview overflow detected.', { page, overflow_px: overflowPx })
        }
      })
    })

    return () => cancelAnimationFrame(frame)
  }, [paginatedDocument, isPaginating])

  return (
    <div
      ref={wrapperRef}
      className="printable-preview-wrapper"
      data-loading={isPaginating ? 'true' : 'false'}
    >
      {isPaginating && (
        <div className="printable-preview__loading">
          <span>Preparing preview…</span>
        </div>
      )}
      <PrintableExerciseDocument
        document={resolvedDocument}
        includeAnswerKey={includeAnswerKey}
        mode="preview"
      />
    </div>
  )
}
