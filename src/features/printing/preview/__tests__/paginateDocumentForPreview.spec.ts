import { describe, expect, it, vi } from 'vitest'
import type { PrintableDocument } from '../../types.ts'
import { paginateDocumentForPreview } from '../paginateDocumentForPreview.tsx'

interface MockMeasurementOptions {
  limit: number
}

const measureSectionUnits = (section: PrintableDocument['pages'][number]['sections'][number]): number => {
  switch (section.type) {
    case 'text':
    case 'passage':
      return section.paragraphs.length
    case 'questions':
      return section.questions.length
    case 'options':
      return section.items.length
    case 'table':
      return section.rows.length
    case 'multi-text':
      return section.texts.length
    case 'spacer':
      return 0
    default:
      return 1
  }
}

const countSectionUnits = (sections: PrintableDocument['pages'][number]['sections']) =>
  sections.reduce((sum, section) => sum + measureSectionUnits(section), 0)

const createMockMeasurerFactory = ({ limit }: MockMeasurementOptions) =>
  (
    metadata: PrintableDocument['metadata'],
    page: Pick<PrintableDocument['pages'][number], 'orientation' | 'role'>,
  ) => ({
    fitsCurrent: async (current: PrintableDocument['pages'][number]['sections'], candidate: PrintableDocument['pages'][number]['sections'][number]) =>
      countSectionUnits([...current, candidate]) <= limit,
    fitsStandalone: async (section: PrintableDocument['pages'][number]['sections'][number]) =>
      countSectionUnits([section]) <= limit,
    dispose: () => {
      void metadata
      void page
    },
  })

const countParagraphsAcrossSections = (sections: PrintableDocument['pages'][number]['sections']) =>
  sections.reduce((sum, section) => {
    if (section.type === 'multi-text') {
      return sum + section.texts.reduce(
        (innerSum, text) => innerSum + (text.paragraphs?.length ?? 0),
        0,
      )
    }
    if ('paragraphs' in section && Array.isArray(section.paragraphs)) {
      return sum + section.paragraphs.length
    }
    return sum + 1
  }, 0)

const createParagraphAwareMeasurer = (limit: number) =>
  (
    metadata: PrintableDocument['metadata'],
    page: Pick<PrintableDocument['pages'][number], 'orientation' | 'role'>,
  ) => ({
    fitsCurrent: async (
      current: PrintableDocument['pages'][number]['sections'],
      candidate: PrintableDocument['pages'][number]['sections'][number],
    ) => countParagraphsAcrossSections([...current, candidate]) <= limit,
    fitsStandalone: async (
      section: PrintableDocument['pages'][number]['sections'][number],
    ) => countParagraphsAcrossSections([section]) <= limit,
    dispose: () => {
      void metadata
      void page
    },
  })

describe('paginateDocumentForPreview', () => {
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
        id: 'page-1',
        role: 'student',
        orientation: 'portrait',
        sections: [
          {
            type: 'text',
            heading: 'Passage',
            paragraphs: Array.from({ length: 6 }, (_, index) => ({ text: `Paragraph ${index + 1}` })),
          },
        ],
      },
    ],
  }

  it('splits long text sections across preview pages', async () => {
    const paginated = await paginateDocumentForPreview(baseDocument, true, {
      createMeasurer: createMockMeasurerFactory({ limit: 3 }),
    })

    expect(paginated.pages).toHaveLength(2)
    const [first, second] = paginated.pages
    const firstSection = first.sections[0]
    expect(firstSection?.type).toBe('text')
    if (!firstSection || firstSection.type !== 'text') {
      throw new Error('Expected first section to be text')
    }
    expect(firstSection.paragraphs).toHaveLength(3)

    const secondSection = second.sections[0]
    expect(secondSection?.type).toBe('text')
    if (!secondSection || secondSection.type !== 'text') {
      throw new Error('Expected second section to be text')
    }
    expect(secondSection.paragraphs).toHaveLength(3)
    if (secondSection.heading === undefined) {
      throw new Error('Expected continued section to include heading')
    }
    expect(secondSection.heading).toContain('(continued)')
  })

  it('respects question section pagination limits', async () => {
    const document: PrintableDocument = {
      ...baseDocument,
      pages: [
        {
          id: 'questions',
          role: 'student',
          orientation: 'portrait',
          sections: [
            {
              type: 'questions',
              heading: 'Questions',
              questions: Array.from({ length: 7 }, (_, index) => ({
                number: index + 1,
                prompt: `Question ${index + 1}`,
              })),
            },
          ],
        },
      ],
    }

    const paginated = await paginateDocumentForPreview(document, true, {
      createMeasurer: createMockMeasurerFactory({ limit: 4 }),
    })

    expect(paginated.pages).toHaveLength(2)
    const totalQuestions = paginated.pages.flatMap((page) =>
      page.sections.flatMap((section) => section.type === 'questions' ? section.questions : []),
    )
    expect(totalQuestions).toHaveLength(7)
    const secondSection = paginated.pages[1]?.sections[0]
    expect(secondSection?.type).toBe('questions')
    if (!secondSection || secondSection.type !== 'questions') {
      throw new Error('Expected second page to contain question section')
    }
    if (secondSection.heading === undefined) {
      throw new Error('Expected continued questions section to include heading')
    }
    expect(secondSection.heading).toContain('(continued)')
  })

  it('waits for document fonts before measuring layout', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts')

    let resolveFontsReady: (() => void) | undefined
    const fontContainer = {
      status: 'loading' as FontFaceSetLoadStatus,
      ready: new Promise<void>((resolve) => {
        resolveFontsReady = () => resolve()
      }),
    }

    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: fontContainer,
    })

    try {
      const fitsCurrent = vi.fn(async () => {
        expect(fontContainer.status).toBe('loaded')
        return true
      })
      const fitsStandalone = vi.fn(async () => {
        expect(fontContainer.status).toBe('loaded')
        return true
      })

      const paginationPromise = paginateDocumentForPreview(baseDocument, true, {
        createMeasurer: () => ({
          fitsCurrent,
          fitsStandalone,
          dispose: vi.fn(),
        }),
      })

      await Promise.resolve()
      expect(fitsCurrent).not.toHaveBeenCalled()

      fontContainer.status = 'loaded'
      if (!resolveFontsReady) {
        throw new Error('Expected fonts ready resolver to be set')
      }
      resolveFontsReady()

      await paginationPromise
      expect(fitsCurrent).toHaveBeenCalled()
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, 'fonts', originalDescriptor)
      } else {
        Reflect.deleteProperty(document, 'fonts')
      }
    }
  })

  it('splits multi-text sections into paragraph continuations when needed', async () => {
    const document: PrintableDocument = {
      ...baseDocument,
      pages: [
        {
          id: 'multi-text',
          role: 'student',
          orientation: 'portrait',
          sections: [
            {
              type: 'multi-text',
              heading: 'Texts',
              texts: [
                {
                  label: 'C',
                  title: 'Sample',
                  paragraphs: Array.from({ length: 4 }, (_, index) => ({
                    text: `Paragraph ${index + 1}`,
                  })),
                },
              ],
            },
          ],
        },
      ],
    }

    const paginated = await paginateDocumentForPreview(document, true, {
      createMeasurer: createParagraphAwareMeasurer(3),
    })

    expect(paginated.pages).toHaveLength(2)
    const firstSection = paginated.pages[0]?.sections[0]
    const secondSection = paginated.pages[1]?.sections[0]
    expect(firstSection?.type).toBe('multi-text')
    expect(secondSection?.type).toBe('multi-text')

    if (!firstSection || firstSection.type !== 'multi-text') {
      throw new Error('Expected first page to contain a multi-text section')
    }
    if (!secondSection || secondSection.type !== 'multi-text') {
      throw new Error('Expected second page to contain a multi-text section')
    }

    expect(firstSection.texts).toHaveLength(1)
    expect(firstSection.texts[0]?.paragraphs?.length).toBe(3)
    expect(secondSection.heading).toContain('(continued)')
    expect(secondSection.texts).toHaveLength(1)
    const continuation = secondSection.texts[0]
    expect(continuation?.paragraphs?.length).toBe(1)
    expect(continuation?.label).toContain('(continued)')
  })
})
