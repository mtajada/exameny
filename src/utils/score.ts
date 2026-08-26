// Utility functions for score parsing and percentage calculations

// Parses strings like "85/100" or "3/5" into a percent (0-100).
// Returns undefined if input is invalid.
export function parseScorePercent(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const match = String(text).match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  const den = parseFloat(match[2]);
  if (!isFinite(num) || !isFinite(den) || den <= 0) return undefined;
  return Math.max(0, Math.min(100, (num / den) * 100));
}

// Parses strings like "85/100" or "3/5" into [numerator, denominator].
// Returns undefined if invalid.
export function parseScoreFraction(text: string | null | undefined): { num: number; den: number } | undefined {
  if (!text) return undefined;
  const match = String(text).match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  const den = parseFloat(match[2]);
  if (!isFinite(num) || !isFinite(den) || den <= 0) return undefined;
  return { num, den };
}

export function toPercent(numerator: number, denominator: number): number {
  if (!isFinite(numerator) || !isFinite(denominator) || denominator <= 0) return 0;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}
