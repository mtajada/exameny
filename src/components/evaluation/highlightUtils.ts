import type { MistakeItemPreview } from '@/hooks/mistakes/types.ts'

export interface HighlightSegment {
  start: number
  end: number
  text: string
  mistakeIds: string[]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeRange(item: MistakeItemPreview, textLength: number) {
  if (item.anchorResolution.status !== 'anchored') {
    return null
  }
  const status = item.anchorAdjustment?.realignmentStatus
  if (status === 'invalid' || status === 'not_found') {
    return null
  }
  if (typeof item.anchorStart !== 'number' || typeof item.anchorEnd !== 'number') {
    return null
  }
  const start = clamp(item.anchorStart, 0, textLength)
  const end = clamp(item.anchorEnd, 0, textLength)
  if (start >= end) {
    return null
  }
  return { start, end }
}

export function buildHighlightSegments(text: string, items: MistakeItemPreview[]): HighlightSegment[] {
  const length = text.length
  if (length === 0) {
    return []
  }

  const validItems = items
    .map((item) => ({ item, range: normalizeRange(item, length) }))
    .filter((entry): entry is { item: MistakeItemPreview; range: { start: number; end: number } } => entry.range !== null)

  if (validItems.length === 0) {
    return [
      {
        start: 0,
        end: length,
        text,
        mistakeIds: [],
      },
    ]
  }

  const boundarySet = new Set<number>([0, length])
  for (const { range } of validItems) {
    boundarySet.add(range.start)
    boundarySet.add(range.end)
  }

  const boundaries = Array.from(boundarySet).sort((a, b) => a - b)
  const segments: HighlightSegment[] = []

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const segmentStart = boundaries[index]
    const segmentEnd = boundaries[index + 1]
    if (segmentStart === segmentEnd) continue

    const segmentMistakes = validItems
      .filter(({ range }) => range.start <= segmentStart && range.end >= segmentEnd)
      .map(({ item }) => item.id)

    segments.push({
      start: segmentStart,
      end: segmentEnd,
      text: text.slice(segmentStart, segmentEnd),
      mistakeIds: segmentMistakes,
    })
  }

  return segments
}
