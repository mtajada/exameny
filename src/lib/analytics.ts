import { track } from '@vercel/analytics'

type AnalyticsProperties = Record<string, string | number | boolean | null>

const analyticsEnabled = import.meta.env.VITE_ENABLE_ANALYTICS === 'true'

/**
 * Product analytics are opt-in and intentionally exclude email addresses,
 * free text, identifiers, and raw error messages.
 */
export function trackProductEvent(name: string, properties: AnalyticsProperties = {}): void {
  if (!analyticsEnabled) return
  track(name, properties)
}
