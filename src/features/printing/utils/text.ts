import type { PrintableParagraph } from '../types.ts'

interface SplitParagraphOptions {
  format?: 'plain' | 'markdown'
}

const detectParagraphFormat = (text: string): 'plain' | 'markdown' => {
  const hasListSyntax = /^\s*(?:[-*+]\s|\d+\.\s)/m.test(text)
  const inlineMarkersPresent = /[*_`~]/.test(text) || text.includes('[')
  const hasInlineMarkdown = inlineMarkersPresent && /(\*\*.*\*\*|\*.*\*|__.*__|_.*_|`.*`|~~.*~~|\[.+?\]\(.+?\))/.test(text)
  return hasListSyntax || hasInlineMarkdown ? 'markdown' : 'plain'
}

/**
 * Splits raw text into printable paragraphs while preserving intentional spacing.
 * Defaults to plain text but can mark the result as markdown-aware when needed.
 */
export const splitTextIntoParagraphs = (
  source: string | null | undefined,
  options: SplitParagraphOptions = {},
): PrintableParagraph[] => {
  if (!source) return []

  const normalized = source.replace(/\r\n/g, '\n')

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map<PrintableParagraph>((block) => ({
      text: block,
      format: options.format ?? detectParagraphFormat(block),
    }))
}

export const createPrintableParagraph = (
  text: string,
  options: SplitParagraphOptions = {},
): PrintableParagraph => ({
  text,
  format: options.format ?? detectParagraphFormat(text),
})
