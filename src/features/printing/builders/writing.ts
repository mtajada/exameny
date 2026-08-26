import type { BuildWritingDocumentParams, PrintableDocument, PrintableTextSection } from '../types.ts'
import { createPrintableParagraph, splitTextIntoParagraphs } from '../utils/text.ts'

const createId = (() => {
  let counter = 0
  return () => {
    counter += 1
    return `print-page-${counter}`
  }
})()

export const buildWritingDocument = ({ metadata, prompt, suggestedTime }: BuildWritingDocumentParams): PrintableDocument => {
  const paragraphs = splitTextIntoParagraphs(prompt, { format: 'markdown' })

  const sections: PrintableTextSection[] = [
    {
      type: 'text',
      heading: 'Task',
      paragraphs,
      style: 'default',
    },
  ]

  if (suggestedTime && Number.isFinite(suggestedTime) && suggestedTime > 0) {
    sections.unshift({
      type: 'text',
      paragraphs: [
        {
          ...createPrintableParagraph(`Suggested time: ${Math.round(suggestedTime)} minutes`),
          emphasis: true,
        },
      ],
      style: 'instructions',
    })
  }

  return {
    metadata: {
      ...metadata,
      suggestedTime: suggestedTime ?? null,
    },
    settings: {
      includeAnswerKeyByDefault: false,
    },
    pages: [
      {
        id: createId(),
        role: 'student',
        orientation: 'portrait',
        sections,
      },
    ],
  }
}
