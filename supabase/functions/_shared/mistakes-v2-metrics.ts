import type { NormalizedMistakesV2Metrics } from "./mistakes-v2.ts";

function normalizeMetricCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function normalizeResolverVersion(value: unknown): number | null {
  const normalized = normalizeMetricCount(value);
  if (normalized === null) return null;
  return normalized;
}

export const PUBLIC_MISTAKES_V2_METRIC_KEYS = [
  "total",
  "anchored",
  "ambiguous",
  "not_found",
  "invalid",
  "resolverDurationMs",
  "resolverVersion",
] as const;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function toPublicMistakesV2Metrics(
  candidate: unknown,
  fallback: NormalizedMistakesV2Metrics,
): NormalizedMistakesV2Metrics {
  if (!isPlainRecord(candidate)) return fallback;
  const source = candidate;

  return {
    total: normalizeMetricCount(source.total) ?? fallback.total,
    anchored: normalizeMetricCount(source.anchored) ?? fallback.anchored,
    ambiguous: normalizeMetricCount(source.ambiguous) ?? fallback.ambiguous,
    not_found: normalizeMetricCount(source.not_found ?? source.notFound) ??
      fallback.not_found,
    invalid: normalizeMetricCount(source.invalid) ?? fallback.invalid,
    resolverDurationMs: normalizeMetricCount(
      source.resolverDurationMs ?? source.resolver_duration_ms,
    ) ?? fallback.resolverDurationMs,
    resolverVersion: normalizeResolverVersion(
      source.resolverVersion ?? source.resolver_version,
    ) ?? fallback.resolverVersion,
  };
}
