import { createRoot, type Root } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { PrintableExerciseDocument } from '../components/PrintableExerciseDocument.tsx'
import type {
  PrintableDocument,
  PrintablePage,
  PrintableSection,
  PrintableTextSection,
  PrintablePassageSection,
  PrintableQuestionSection,
  PrintableOptionsSection,
  PrintableTableSection,
  PrintableMultipleTextsSection,
} from '../types.ts'

export type PaginatedDocument = Pick<PrintableDocument, 'metadata' | 'settings'> & {
  pages: PrintablePage[]
}

type SectionForPagination = PrintableSection & { heading?: string }

const appendContinued = (heading: string | undefined, suffix = ' (continued)'): string | undefined => {
  if (!heading) return heading
  return heading.includes(suffix) ? heading : `${heading}${suffix}`
}

const appendContinuedLabel = (label: string | undefined, suffix = ' (continued)'): string | undefined => {
  if (!label) return label
  return label.includes(suffix) ? label : `${label}${suffix}`
}

const cloneParagraph = (paragraph: PrintableTextSection['paragraphs'][number]): PrintableTextSection['paragraphs'][number] => ({
  ...paragraph,
})

const cloneParagraphs = (paragraphs: PrintableTextSection['paragraphs'] | undefined): PrintableTextSection['paragraphs'] =>
  (paragraphs ?? []).map((paragraph) => cloneParagraph(paragraph))

const waitForLayout = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => resolve())
  })
})

interface PageMeasurer {
  fitsCurrent: (current: PrintableSection[], candidate: PrintableSection) => Promise<boolean>
  fitsStandalone: (section: PrintableSection) => Promise<boolean>
  dispose: () => void
}

const MEASUREMENT_TOLERANCE_PX = 1.5

const waitForDocumentFonts = async () => {
  if (typeof document === 'undefined') return
  const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts
  if (!fontSet) return
  if (fontSet.status === 'loaded') return
  try {
    await fontSet.ready
  } catch (error) {
    console.warn('[printing] Font loading issue while preparing preview')
  }
}

class PageMeasurementEnvironment implements PageMeasurer {
  private root: Root
  private host: HTMLDivElement
  private metadata: PrintableDocument['metadata']
  private basePage: Pick<PrintablePage, 'role' | 'orientation'>

  constructor(metadata: PrintableDocument['metadata'], basePage: Pick<PrintablePage, 'role' | 'orientation'>) {
    this.metadata = metadata
    this.basePage = basePage

    this.host = document.createElement('div')
    this.host.className = 'printable-preview-measurement'
    Object.assign(this.host.style, {
      position: 'absolute',
      visibility: 'hidden',
      pointerEvents: 'none',
      inset: '0',
      width: this.basePage.orientation === 'landscape' ? '297mm' : '210mm',
      transform: 'translate(-200vw, -200vh)',
      overflow: 'hidden',
      zIndex: '-1',
    } as Partial<CSSStyleDeclaration>)
    document.body.appendChild(this.host)
    this.root = createRoot(this.host)
  }

  dispose() {
    this.root.unmount()
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host)
    }
  }

  private renderSections(sections: PrintableSection[]) {
    const measurementDocument: PrintableDocument = {
      metadata: this.metadata,
      settings: {
        includeAnswerKeyByDefault: false,
      },
      pages: [
        {
          id: 'measurement-page',
          role: this.basePage.role,
          orientation: this.basePage.orientation,
          sections,
        },
      ],
    }

    this.root.render(
      <PrintableExerciseDocument
        document={measurementDocument}
        includeAnswerKey
        mode="preview"
      />,
    )
  }

  async measure(sections: PrintableSection[]): Promise<{ fits: boolean; clientHeight: number; scrollHeight: number }> {
    this.renderSections(sections)
    await waitForLayout()

    const content = this.host.querySelector('.printable-page__content') as HTMLElement | null
    if (!content) {
      return { fits: true, clientHeight: 0, scrollHeight: 0 }
    }

    return {
      fits: content.scrollHeight <= content.clientHeight + MEASUREMENT_TOLERANCE_PX,
      clientHeight: content.clientHeight,
      scrollHeight: content.scrollHeight,
    }
  }

  async fitsCurrent(current: PrintableSection[], candidate: PrintableSection): Promise<boolean> {
    const sections = [...current, candidate]
    const { fits } = await this.measure(sections)
    return fits
  }

  async fitsStandalone(section: PrintableSection): Promise<boolean> {
    const { fits } = await this.measure([section])
    return fits
  }
}

const cloneSection = <T extends PrintableSection>(section: T): T => JSON.parse(JSON.stringify(section))

const createChunkSection = <Section extends SectionForPagination>(
  baseSection: Section,
  override: Partial<Section>,
  isContinuation: boolean,
): Section => cloneSection({
  ...baseSection,
  ...override,
  heading: isContinuation ? appendContinued(baseSection.heading) : baseSection.heading,
})

const splitSequentialItems = async <Section extends SectionForPagination, Item>(
  items: Item[],
  environment: PageMeasurer,
  createSection: (slice: Item[], isContinuation: boolean) => Section,
): Promise<Section[]> => {
  if (items.length === 0) {
    return []
  }

  const chunks: Section[] = []
  let index = 0

  while (index < items.length) {
    let low = index + 1
    let high = items.length
    let best = index + 1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const candidate = createSection(items.slice(index, mid), index > 0)
      const fits = await environment.fitsStandalone(candidate)

      if (fits) {
        best = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    if (best <= index) {
      best = index + 1
    }

    const chunk = items.slice(index, best)
    chunks.push(createSection(chunk, index > 0))
    index = best
  }

  return chunks
}

const splitParagraphSection = async <Section extends SectionForPagination & { paragraphs: PrintableTextSection['paragraphs'] }>(
  section: Section,
  environment: PageMeasurer,
): Promise<Section[]> => splitSequentialItems(
  section.paragraphs ?? [],
  environment,
  (slice, isContinuation) => createChunkSection(section, { paragraphs: slice } as Partial<Section>, isContinuation),
)

const splitTextSection = (
  section: PrintableTextSection,
  environment: PageMeasurer,
): Promise<PrintableTextSection[]> => splitParagraphSection(section, environment)

const splitPassageSection = (
  section: PrintablePassageSection,
  environment: PageMeasurer,
): Promise<PrintablePassageSection[]> => splitParagraphSection(section, environment)

const splitQuestionSection = async (
  section: PrintableQuestionSection,
  environment: PageMeasurer,
): Promise<PrintableQuestionSection[]> => splitSequentialItems(
  section.questions ?? [],
  environment,
  (slice, isContinuation) => createChunkSection(section, { questions: slice } as Partial<PrintableQuestionSection>, isContinuation),
)

const splitOptionsSection = async (
  section: PrintableOptionsSection,
  environment: PageMeasurer,
): Promise<PrintableOptionsSection[]> => splitSequentialItems(
  section.items ?? [],
  environment,
  (slice, isContinuation) => createChunkSection(section, { items: slice } as Partial<PrintableOptionsSection>, isContinuation),
)

const splitTableSection = async (
  section: PrintableTableSection,
  environment: PageMeasurer,
): Promise<PrintableTableSection[]> => splitSequentialItems(
  section.rows ?? [],
  environment,
  (slice, isContinuation) => createChunkSection(section, { rows: slice } as Partial<PrintableTableSection>, isContinuation),
)

const splitMultiTextSection = async (
  section: PrintableMultipleTextsSection,
  environment: PageMeasurer,
): Promise<PrintableMultipleTextsSection[]> => {
  const texts = section.texts ?? []
  if (texts.length === 0) {
    return []
  }

  const expandedTexts: typeof texts = []

  const ensureTextSegmentsFit = async (
    text: PrintableMultipleTextsSection['texts'][number],
  ): Promise<typeof texts> => {
    const baseText = {
      ...text,
      paragraphs: cloneParagraphs(text.paragraphs),
    }

    const singularSection = createChunkSection(
      section as SectionForPagination,
      { texts: [baseText] } as Partial<PrintableMultipleTextsSection>,
      expandedTexts.length > 0,
    )

    if (await environment.fitsStandalone(singularSection)) {
      return [baseText]
    }

    const paragraphs = text.paragraphs ?? []
    if (paragraphs.length === 0) {
      return [baseText]
    }

    const segments: typeof texts = []
    let start = 0

    while (start < paragraphs.length) {
      let low = start + 1
      let high = paragraphs.length
      let best = start + 1

      while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        const slice = cloneParagraphs(paragraphs.slice(start, mid))
        const candidateText = {
          ...text,
          paragraphs: slice,
          label: segments.length > 0 ? appendContinuedLabel(text.label) : text.label,
        }
        const candidateSection = createChunkSection(
          section as SectionForPagination,
          { texts: [candidateText] } as Partial<PrintableMultipleTextsSection>,
          expandedTexts.length > 0 || segments.length > 0,
        )
        const fits = await environment.fitsStandalone(candidateSection)

        if (fits) {
          best = mid
          low = mid + 1
        } else {
          high = mid - 1
        }
      }

      if (best <= start) {
        best = start + 1
      }

      const segmentParagraphs = cloneParagraphs(paragraphs.slice(start, best))
      segments.push({
        ...text,
        paragraphs: segmentParagraphs,
        label: segments.length > 0 ? appendContinuedLabel(text.label) : text.label,
      })
      start = best
    }

    return segments
  }

  for (const text of texts) {
    const segments = await ensureTextSegmentsFit(text)
    expandedTexts.push(...segments)
  }

  return splitSequentialItems(
    expandedTexts,
    environment,
    (slice, isContinuation) => createChunkSection(section, { texts: slice } as Partial<PrintableMultipleTextsSection>, isContinuation),
  )
}

const splitSectionIfNeeded = async (
  section: PrintableSection,
  environment: PageMeasurer,
): Promise<PrintableSection[]> => {
  switch (section.type) {
    case 'text':
      return splitTextSection(section, environment)
    case 'passage':
      return splitPassageSection(section, environment)
    case 'questions':
      return splitQuestionSection(section, environment)
    case 'options':
      return splitOptionsSection(section, environment)
    case 'table':
      return splitTableSection(section, environment)
    case 'multi-text':
      return splitMultiTextSection(section, environment)
    case 'spacer':
      return [section]
    case 'page-break':
      return [section]
    default:
      return [section]
  }
}

const paginateSections = async (
  baseSections: PrintableSection[],
  environment: PageMeasurer,
): Promise<PrintableSection[][]> => {
  const result: PrintableSection[][] = []
  let current: PrintableSection[] = []

  const pushCurrent = () => {
    if (current.length > 0) {
      result.push(current)
      current = []
    }
  }

  for (const originalSection of baseSections) {
    if (originalSection.type === 'page-break') {
      pushCurrent()
      continue
    }

    const sectionCopy = cloneSection(originalSection)
    const fitsCurrent = await environment.fitsCurrent(current, sectionCopy)

    if (fitsCurrent) {
      current.push(sectionCopy)
      continue
    }

    const fitsStandalone = await environment.fitsStandalone(sectionCopy)

    if (fitsStandalone) {
      pushCurrent()
      current.push(sectionCopy)
      continue
    }

    const splitSections = await splitSectionIfNeeded(sectionCopy, environment)

    for (const splitSection of splitSections) {
      const fitsWithCurrent = await environment.fitsCurrent(current, splitSection)
      if (fitsWithCurrent) {
        current.push(splitSection)
      } else if (await environment.fitsStandalone(splitSection)) {
        pushCurrent()
        current.push(splitSection)
      } else {
        // As a last resort, force render to avoid infinite loop.
        pushCurrent()
        current.push(splitSection)
        pushCurrent()
      }
    }
  }

  pushCurrent()
  return result
}

const mapPaginatedSectionsToPages = (
  basePage: PrintablePage,
  pagesSections: PrintableSection[][],
): PrintablePage[] => {
  if (pagesSections.length === 0) {
    return [{ ...basePage, sections: [] }]
  }

  return pagesSections.map((sections, index) => ({
    ...basePage,
    id: `${basePage.id}--preview-${index + 1}`,
    sections,
  }))
}

interface PaginatePreviewOptions {
  createMeasurer?: (
    metadata: PrintableDocument['metadata'],
    page: Pick<PrintablePage, 'role' | 'orientation'>,
  ) => PageMeasurer
}

const defaultMeasurementFactory = (
  metadata: PrintableDocument['metadata'],
  page: Pick<PrintablePage, 'role' | 'orientation'>,
): PageMeasurer => new PageMeasurementEnvironment(metadata, page)

const createFilteredDocument = (
  document: PrintableDocument,
  includeAnswerKey: boolean,
): PaginatedDocument => ({
  metadata: document.metadata,
  settings: document.settings,
  pages: document.pages.filter((page) => includeAnswerKey || page.role !== 'answer-key'),
})

export const paginateDocumentForPreview = async (
  document: PrintableDocument,
  includeAnswerKey: boolean,
  options?: PaginatePreviewOptions,
): Promise<PaginatedDocument> => {
  await waitForDocumentFonts()

  const filteredDocument = createFilteredDocument(document, includeAnswerKey)

  const paginatedPages: PrintablePage[] = []
  const factory = options?.createMeasurer ?? defaultMeasurementFactory

  for (const page of filteredDocument.pages) {
    const environment = factory(document.metadata, {
      role: page.role,
      orientation: page.orientation,
    })

    try {
      const segmentedSections = await paginateSections(page.sections, environment)
      const mappedPages = mapPaginatedSectionsToPages(page, segmentedSections)
      paginatedPages.push(...mappedPages)
    } finally {
      environment.dispose()
    }
  }

  return {
    metadata: filteredDocument.metadata,
    settings: filteredDocument.settings,
    pages: paginatedPages,
  }
}

export const usePaginatedPreviewDocument = (
  sourceDocument: PrintableDocument | null,
  includeAnswerKey: boolean,
  options?: PaginatePreviewOptions,
) => {
  const [paginatedDocument, setPaginatedDocument] = useState<PaginatedDocument | null>(null)
  const [isPaginating, setIsPaginating] = useState(false)
  const requestIdRef = useRef(0)
  const [fontLoadVersion, setFontLoadVersion] = useState(0)

  useEffect(() => {
    const globalDocument = typeof globalThis !== 'undefined' ? globalThis.document : undefined
    const fontSet = (globalDocument as Document & { fonts?: FontFaceSet } | undefined)?.fonts
    if (!fontSet) return

    const handleFontUpdate = () => {
      setFontLoadVersion((version) => version + 1)
    }

    fontSet.addEventListener?.('loadingdone', handleFontUpdate)
    fontSet.addEventListener?.('loadingerror', handleFontUpdate)

    return () => {
      fontSet.removeEventListener?.('loadingdone', handleFontUpdate)
      fontSet.removeEventListener?.('loadingerror', handleFontUpdate)
    }
  }, [])

  useEffect(() => {
    if (!sourceDocument) {
      requestIdRef.current += 1
      setPaginatedDocument(null)
      setIsPaginating(false)
      return
    }

    let isMounted = true
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsPaginating(true)

    paginateDocumentForPreview(sourceDocument, includeAnswerKey, options)
      .then((result) => {
        if (!isMounted || requestId !== requestIdRef.current) return
        setPaginatedDocument(result)
      })
      .catch((error) => {
        console.error('[printing] Failed to paginate preview document')
        if (!isMounted || requestId !== requestIdRef.current) return
        setPaginatedDocument(createFilteredDocument(sourceDocument, includeAnswerKey))
      })
      .finally(() => {
        if (!isMounted || requestId !== requestIdRef.current) return
        setIsPaginating(false)
      })

    return () => {
      isMounted = false
    }
  }, [sourceDocument, includeAnswerKey, options, fontLoadVersion])

  return { paginatedDocument, isPaginating }
}
