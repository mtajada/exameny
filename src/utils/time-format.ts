export type DurationFormatStyle = 'timer' | 'compact'

interface FormatDurationOptions {
  style?: DurationFormatStyle
  includeSeconds?: boolean
  fallback?: string
}

function sanitizeInput(value: unknown): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  if (value < 0) return 0
  return Math.floor(value)
}

function formatTimerStyle(totalSeconds: number, fallback: string): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }

  return `${mm}:${ss}`
}

function formatCompactStyle(totalSeconds: number, includeSeconds: boolean, fallback: string): string {
  if (totalSeconds <= 0) {
    return includeSeconds ? '0s' : '0m'
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []

  if (hours > 0) {
    parts.push(`${hours}h`)
    parts.push(`${String(minutes).padStart(2, '0')}m`)
  } else if (minutes > 0) {
    parts.push(`${minutes}m`)
  }

  if (includeSeconds) {
    const secondsLabel = hours > 0 || minutes > 0 ? String(seconds).padStart(2, '0') : String(seconds)
    parts.push(`${secondsLabel}s`)
  } else if (parts.length === 0) {
    // If we are not including seconds and have less than a minute, show <1m indicator
    parts.push('<1m')
  }

  return parts.join(' ')
}

export function formatDuration(totalSeconds: unknown, options: FormatDurationOptions = {}): string {
  const style = options.style ?? 'timer'
  const includeSeconds = options.includeSeconds ?? (style === 'timer')
  const fallback = options.fallback ?? (style === 'timer' ? '00:00' : '0m')

  const sanitized = sanitizeInput(totalSeconds)
  if (sanitized === null) return fallback

  switch (style) {
    case 'compact':
      return formatCompactStyle(sanitized, includeSeconds, fallback)
    case 'timer':
    default:
      return formatTimerStyle(sanitized, fallback)
  }
}

export function formatDurationTimer(totalSeconds: unknown): string {
  return formatDuration(totalSeconds, { style: 'timer' })
}

export function formatDurationCompact(totalSeconds: unknown, includeSeconds = false): string {
  return formatDuration(totalSeconds, { style: 'compact', includeSeconds })
}

export type TimeComparisonResult =
  | { status: 'no-data'; actualSeconds: null; suggestedSeconds: number | null }
  | { status: 'no-target'; actualSeconds: number; suggestedSeconds: null }
  | { status: 'within'; actualSeconds: number; suggestedSeconds: number; deltaSeconds: number }
  | { status: 'over'; actualSeconds: number; suggestedSeconds: number; deltaSeconds: number }

export function assessTimeAgainstTarget(
  actualSeconds: unknown,
  suggestedMinutes: unknown,
): TimeComparisonResult {
  const actual = sanitizeInput(actualSeconds)
  const suggested =
    typeof suggestedMinutes === 'number' && Number.isFinite(suggestedMinutes) && suggestedMinutes > 0
      ? Math.floor(suggestedMinutes * 60)
      : null

  if (actual === null || actual <= 0) {
    return { status: 'no-data', actualSeconds: null, suggestedSeconds: suggested }
  }

  if (suggested === null) {
    return { status: 'no-target', actualSeconds: actual, suggestedSeconds: null }
  }

  if (actual <= suggested) {
    return { status: 'within', actualSeconds: actual, suggestedSeconds: suggested, deltaSeconds: suggested - actual }
  }

  return { status: 'over', actualSeconds: actual, suggestedSeconds: suggested, deltaSeconds: actual - suggested }
}

export type TimeDisplayTone = 'neutral' | 'positive' | 'negative'

export interface TimeDisplayMeta {
  actualLabel: string
  helperText: string
  tone: TimeDisplayTone
  hasData: boolean
  suggestedLabel: string
}

export function buildTimeDisplayMeta(
  actualSeconds: unknown,
  suggestedMinutes: unknown,
): TimeDisplayMeta {
  const comparison = assessTimeAgainstTarget(actualSeconds, suggestedMinutes)
  const suggestedLabel = (() => {
    if (comparison.status === 'no-target') {
      return 'Not set'
    }

    let suggestedSeconds: number | null = null
    switch (comparison.status) {
      case 'no-data':
        suggestedSeconds = comparison.suggestedSeconds
        break
      case 'within':
      case 'over':
        suggestedSeconds = comparison.suggestedSeconds
        break
    }

    if (suggestedSeconds == null) return 'Not set'
    return formatDuration(suggestedSeconds, { style: 'compact', includeSeconds: false, fallback: 'Not set' })
  })()

  switch (comparison.status) {
    case 'no-data':
      return {
        actualLabel: 'N/A',
        helperText: comparison.suggestedSeconds != null ? `Suggested: ${suggestedLabel}` : 'Suggested: Not set',
        tone: 'neutral',
        hasData: false,
        suggestedLabel,
      }
    case 'no-target':
      return {
        actualLabel: formatDuration(comparison.actualSeconds, { style: 'compact', includeSeconds: true }),
        helperText: 'Suggested: Not set',
        tone: 'neutral',
        hasData: true,
        suggestedLabel,
      }
    case 'within': {
      const { deltaSeconds, suggestedSeconds, actualSeconds } = comparison
      const deltaLabel = deltaSeconds === 0
        ? 'On target'
        : `-${formatDuration(deltaSeconds, { style: 'compact', includeSeconds: true })}`
      const helperText = `${deltaLabel} vs ${formatDuration(suggestedSeconds, { style: 'compact', includeSeconds: false })}`
      return {
        actualLabel: formatDuration(actualSeconds, { style: 'compact', includeSeconds: true }),
        helperText,
        tone: 'positive',
        hasData: true,
        suggestedLabel,
      }
    }
    case 'over': {
      const { deltaSeconds, suggestedSeconds, actualSeconds } = comparison
      const helperText = `+${formatDuration(deltaSeconds, { style: 'compact', includeSeconds: true })} vs ${formatDuration(suggestedSeconds, { style: 'compact', includeSeconds: false })}`
      return {
        actualLabel: formatDuration(actualSeconds, { style: 'compact', includeSeconds: true }),
        helperText,
        tone: 'negative',
        hasData: true,
        suggestedLabel,
      }
    }
  }
}
