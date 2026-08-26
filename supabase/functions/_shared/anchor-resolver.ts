export interface AnchorPatch {
  before: string;
  after?: string | null;
  contextBefore?: string;
  contextAfter?: string;
}

export type AnchorResolution =
  | {
    status: "anchored";
    start: number;
    end: number;
    strategy:
      | "legacy_offsets"
      | "composite"
      | "before_unique"
      | "context_score"
      | "whitespace";
    confidence: number;
  }
  | {
    status: "ambiguous";
    strategy: "context_score" | "before_multiple";
    // May be capped at maxCandidates + 1 when the scan is cut short.
    candidates: number;
  }
  | {
    status: "not_found";
    strategy: "composite" | "before" | "whitespace";
  }
  | {
    status: "invalid";
    reason: string;
  };

export interface AnchorResolverOptions {
  minBeforeLength?: number;
  maxBeforeLength?: number;
  maxAfterLength?: number;
  maxContextLength?: number;
  minContextTotal?: number;
  maxSubmissionLengthForWhitespace?: number;
  minScore?: number;
  minMargin?: number;
  maxCandidates?: number;
  weights?: {
    before?: number;
    after?: number;
  };
}

export const DEFAULT_ANCHOR_RESOLVER_OPTIONS = {
  minBeforeLength: 3,
  maxBeforeLength: 120,
  maxAfterLength: 120,
  maxContextLength: 40,
  minContextTotal: 12,
  maxSubmissionLengthForWhitespace: 10_000,
  minScore: 0.85,
  minMargin: 0.08,
  maxCandidates: 50,
  weights: {
    before: 0.5,
    after: 0.5,
  },
};

export type ResolvedAnchorOptions = Required<AnchorResolverOptions> & {
  weights: {
    before: number;
    after: number;
  };
};

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function resolveOptions(
  options?: AnchorResolverOptions,
): ResolvedAnchorOptions {
  const minBeforeLength = clampNumber(
    options?.minBeforeLength,
    1,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.maxBeforeLength,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.minBeforeLength,
  );
  const maxBeforeLength = clampNumber(
    options?.maxBeforeLength,
    minBeforeLength,
    10_000,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.maxBeforeLength,
  );
  const maxAfterLength = clampNumber(
    options?.maxAfterLength,
    0,
    10_000,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.maxAfterLength,
  );
  const maxContextLength = clampNumber(
    options?.maxContextLength,
    0,
    1_000,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.maxContextLength,
  );
  const minContextTotal = clampNumber(
    options?.minContextTotal,
    0,
    maxContextLength * 2,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.minContextTotal,
  );
  const maxSubmissionLengthForWhitespace = clampNumber(
    options?.maxSubmissionLengthForWhitespace,
    0,
    1_000_000,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.maxSubmissionLengthForWhitespace,
  );
  const minScore = clampNumber(
    options?.minScore,
    0,
    1,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.minScore,
  );
  const minMargin = clampNumber(
    options?.minMargin,
    0,
    1,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.minMargin,
  );
  const maxCandidates = Math.trunc(clampNumber(
    options?.maxCandidates,
    1,
    10_000,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.maxCandidates,
  ));
  const weightBefore = clampNumber(
    options?.weights?.before,
    0,
    1,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.weights.before,
  );
  const weightAfter = clampNumber(
    options?.weights?.after,
    0,
    1,
    DEFAULT_ANCHOR_RESOLVER_OPTIONS.weights.after,
  );

  return {
    ...DEFAULT_ANCHOR_RESOLVER_OPTIONS,
    ...options,
    minBeforeLength,
    maxBeforeLength,
    maxAfterLength,
    maxContextLength,
    minContextTotal,
    maxSubmissionLengthForWhitespace,
    minScore,
    minMargin,
    maxCandidates,
    weights: {
      before: weightBefore,
      after: weightAfter,
    },
  };
}

export function findAllOccurrences(
  haystack: string,
  needle: string,
  maxHits = Number.POSITIVE_INFINITY,
): number[] {
  if (!needle) return [];
  const hits: number[] = [];
  let index = 0;
  while (index <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, index);
    if (at === -1) break;
    hits.push(at);
    if (hits.length >= maxHits) break;
    index = at + 1;
  }
  return hits;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = new Array<number>(rows * cols);

  for (let i = 0; i < rows; i += 1) matrix[i * cols] = i;
  for (let j = 0; j < cols; j += 1) matrix[j] = j;

  for (let i = 1; i < rows; i += 1) {
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j += 1) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      const del = matrix[(i - 1) * cols + j] + 1;
      const ins = matrix[i * cols + (j - 1)] + 1;
      const sub = matrix[(i - 1) * cols + (j - 1)] + cost;
      matrix[i * cols + j] = Math.min(del, ins, sub);
    }
  }

  return matrix[rows * cols - 1];
}

function similarityScore(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return Math.max(0, Math.min(1, 1 - distance / maxLen));
}

function normalizeWhitespace(text: string): string {
  let normalized = "";
  let inWhitespace = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        normalized += " ";
        inWhitespace = true;
      }
      continue;
    }
    normalized += char;
    inWhitespace = false;
  }
  return normalized;
}

function normalizeWhitespaceWithMap(text: string): {
  normalized: string;
  normIndexToOriginalIndex: number[];
} {
  let normalized = "";
  const normIndexToOriginalIndex: number[] = [];
  let inWhitespace = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        normalized += " ";
        normIndexToOriginalIndex.push(i);
        inWhitespace = true;
      }
      continue;
    }
    normalized += char;
    normIndexToOriginalIndex.push(i);
    inWhitespace = false;
  }

  return { normalized, normIndexToOriginalIndex };
}

function hasWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function isValidSpan(start: number, end: number, length: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 &&
    end > start && end <= length;
}

export function resolveCompositeExact(
  submissionText: string,
  patch: AnchorPatch,
  options: ResolvedAnchorOptions,
): AnchorResolution | null {
  const contextBefore = patch.contextBefore ?? "";
  const contextAfter = patch.contextAfter ?? "";
  const contextTotal = contextBefore.length + contextAfter.length;
  if (contextTotal < options.minContextTotal) return null;

  const composite = `${contextBefore}${patch.before}${contextAfter}`;
  if (composite.length <= patch.before.length) return null;

  const hits = findAllOccurrences(
    submissionText,
    composite,
    options.maxCandidates + 1,
  );

  if (hits.length === 0) return null;
  if (hits.length > options.maxCandidates) {
    return {
      status: "ambiguous",
      strategy: "before_multiple",
      candidates: hits.length,
    };
  }

  if (hits.length === 1) {
    const start = hits[0] + contextBefore.length;
    const end = start + patch.before.length;
    if (!isValidSpan(start, end, submissionText.length)) {
      return { status: "not_found", strategy: "composite" };
    }
    return {
      status: "anchored",
      start,
      end,
      strategy: "composite",
      confidence: 1,
    };
  }

  const candidateStarts = hits.map((hit) => hit + contextBefore.length);
  return resolveByContextScore(submissionText, patch, candidateStarts, options);
}

export function resolveBeforeExact(
  submissionText: string,
  patch: AnchorPatch,
  options: ResolvedAnchorOptions,
): AnchorResolution | null {
  const hits = findAllOccurrences(
    submissionText,
    patch.before,
    options.maxCandidates + 1,
  );
  if (hits.length === 0) return null;
  if (hits.length > options.maxCandidates) {
    return {
      status: "ambiguous",
      strategy: "before_multiple",
      candidates: hits.length,
    };
  }
  if (hits.length === 1) {
    const start = hits[0];
    const end = start + patch.before.length;
    if (!isValidSpan(start, end, submissionText.length)) {
      return { status: "not_found", strategy: "before" };
    }
    return {
      status: "anchored",
      start,
      end,
      strategy: "before_unique",
      confidence: 1,
    };
  }
  return resolveByContextScore(submissionText, patch, hits, options);
}

export function resolveByContextScore(
  submissionText: string,
  patch: AnchorPatch,
  candidateStarts: number[],
  options: ResolvedAnchorOptions,
): AnchorResolution {
  const contextBefore = patch.contextBefore ?? "";
  const contextAfter = patch.contextAfter ?? "";
  const contextBeforeLen = contextBefore.length;
  const contextAfterLen = contextAfter.length;

  if (candidateStarts.length > options.maxCandidates) {
    return {
      status: "ambiguous",
      strategy: "before_multiple",
      candidates: candidateStarts.length,
    };
  }

  if (contextBeforeLen === 0 && contextAfterLen === 0) {
    return {
      status: "ambiguous",
      strategy: "before_multiple",
      candidates: candidateStarts.length,
    };
  }

  const weightBefore = contextBeforeLen > 0 ? options.weights.before : 0;
  const weightAfter = contextAfterLen > 0 ? options.weights.after : 0;
  const weightSum = weightBefore + weightAfter;

  if (weightSum === 0) {
    return {
      status: "ambiguous",
      strategy: "before_multiple",
      candidates: candidateStarts.length,
    };
  }

  const scored = candidateStarts.map((start) => {
    const end = start + patch.before.length;
    const actualBefore = contextBeforeLen > 0
      ? submissionText.slice(Math.max(0, start - contextBeforeLen), start)
      : "";
    const actualAfter = contextAfterLen > 0
      ? submissionText.slice(
        end,
        Math.min(submissionText.length, end + contextAfterLen),
      )
      : "";

    const scoreBefore = contextBeforeLen > 0
      ? similarityScore(actualBefore, contextBefore)
      : 0;
    const scoreAfter = contextAfterLen > 0
      ? similarityScore(actualAfter, contextAfter)
      : 0;
    const score = (scoreBefore * weightBefore + scoreAfter * weightAfter) /
      weightSum;
    return { start, end, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best) {
    return {
      status: "ambiguous",
      strategy: "context_score",
      candidates: candidateStarts.length,
    };
  }

  const margin = second ? best.score - second.score : 1;
  if (best.score >= options.minScore && margin >= options.minMargin) {
    if (!isValidSpan(best.start, best.end, submissionText.length)) {
      return { status: "not_found", strategy: "before" };
    }
    return {
      status: "anchored",
      start: best.start,
      end: best.end,
      strategy: "context_score",
      confidence: best.score,
    };
  }

  return {
    status: "ambiguous",
    strategy: "context_score",
    candidates: candidateStarts.length,
  };
}

export function resolveWhitespaceNormalized(
  submissionText: string,
  patch: AnchorPatch,
  options: ResolvedAnchorOptions,
): AnchorResolution | null {
  if (submissionText.length > options.maxSubmissionLengthForWhitespace) {
    return null;
  }

  const contextBefore = patch.contextBefore ?? "";
  const contextAfter = patch.contextAfter ?? "";
  if (
    !hasWhitespace(patch.before) && !hasWhitespace(contextBefore) &&
    !hasWhitespace(contextAfter)
  ) {
    return null;
  }

  const { normalized, normIndexToOriginalIndex } = normalizeWhitespaceWithMap(
    submissionText,
  );
  const normalizedPatch: AnchorPatch = {
    before: normalizeWhitespace(patch.before),
    contextBefore: normalizeWhitespace(contextBefore),
    contextAfter: normalizeWhitespace(contextAfter),
    after: patch.after ?? null,
  };

  let resolution = resolveCompositeExact(normalized, normalizedPatch, options);
  if (resolution?.status === "anchored") {
    return mapNormalizedResolution(
      submissionText,
      patch.before,
      resolution,
      normIndexToOriginalIndex,
    );
  }
  if (resolution?.status === "ambiguous") {
    return resolution;
  }

  resolution = resolveBeforeExact(normalized, normalizedPatch, options);
  if (!resolution) {
    return { status: "not_found", strategy: "whitespace" };
  }
  if (resolution.status === "anchored") {
    return mapNormalizedResolution(
      submissionText,
      patch.before,
      resolution,
      normIndexToOriginalIndex,
    );
  }
  return resolution;
}

function mapNormalizedResolution(
  submissionText: string,
  before: string,
  resolution: AnchorResolution,
  normIndexToOriginalIndex: number[],
): AnchorResolution {
  if (resolution.status !== "anchored") return resolution;
  const normStart = resolution.start;
  const normEnd = resolution.end;
  if (
    normStart < 0 || normEnd > normIndexToOriginalIndex.length ||
    normEnd <= normStart
  ) {
    return { status: "not_found", strategy: "whitespace" };
  }

  const origStart = normIndexToOriginalIndex[normStart];
  const origEndIndex = normIndexToOriginalIndex[normEnd - 1];
  if (origStart === undefined || origEndIndex === undefined) {
    return { status: "not_found", strategy: "whitespace" };
  }

  const origEnd = origEndIndex + 1;
  if (!isValidSpan(origStart, origEnd, submissionText.length)) {
    return { status: "not_found", strategy: "whitespace" };
  }

  const originalSlice = submissionText.slice(origStart, origEnd);
  const normalizedSlice = normalizeWhitespace(originalSlice);
  const normalizedBefore = normalizeWhitespace(before);
  if (normalizedSlice !== normalizedBefore) {
    return { status: "not_found", strategy: "whitespace" };
  }

  return {
    status: "anchored",
    start: origStart,
    end: origEnd,
    strategy: "whitespace",
    confidence: resolution.confidence,
  };
}

export function resolveAnchorPatch(
  submissionText: string,
  patch: AnchorPatch,
  options?: AnchorResolverOptions,
): AnchorResolution {
  if (typeof submissionText !== "string") {
    return { status: "invalid", reason: "submission_text_not_string" };
  }

  const resolvedOptions = resolveOptions(options);

  if (typeof patch.before !== "string") {
    return { status: "invalid", reason: "before_not_string" };
  }
  if (patch.contextBefore != null && typeof patch.contextBefore !== "string") {
    return { status: "invalid", reason: "context_before_not_string" };
  }
  if (patch.contextAfter != null && typeof patch.contextAfter !== "string") {
    return { status: "invalid", reason: "context_after_not_string" };
  }
  if (patch.after != null && typeof patch.after !== "string") {
    return { status: "invalid", reason: "after_not_string" };
  }

  const before = patch.before;
  const contextBefore = patch.contextBefore ?? "";
  const contextAfter = patch.contextAfter ?? "";

  if (before.trim().length < resolvedOptions.minBeforeLength) {
    return { status: "invalid", reason: "before_too_short" };
  }
  if (before.length > resolvedOptions.maxBeforeLength) {
    return { status: "invalid", reason: "before_too_long" };
  }
  if (
    patch.after != null && patch.after.length > resolvedOptions.maxAfterLength
  ) {
    return { status: "invalid", reason: "after_too_long" };
  }
  if (
    contextBefore.length > resolvedOptions.maxContextLength ||
    contextAfter.length > resolvedOptions.maxContextLength
  ) {
    return { status: "invalid", reason: "context_too_long" };
  }

  const normalizedPatch: AnchorPatch = {
    before,
    contextBefore,
    contextAfter,
    after: patch.after ?? null,
  };

  let ambiguousResult: AnchorResolution | null = null;

  const compositeResult = resolveCompositeExact(
    submissionText,
    normalizedPatch,
    resolvedOptions,
  );
  if (compositeResult?.status === "anchored") {
    return compositeResult;
  }
  if (compositeResult?.status === "ambiguous") {
    ambiguousResult = compositeResult;
  }

  const beforeResult = resolveBeforeExact(
    submissionText,
    normalizedPatch,
    resolvedOptions,
  );
  if (beforeResult?.status === "anchored") {
    return beforeResult;
  }
  if (beforeResult?.status === "ambiguous") {
    ambiguousResult = beforeResult;
  }

  const whitespaceResult = resolveWhitespaceNormalized(
    submissionText,
    normalizedPatch,
    resolvedOptions,
  );
  if (whitespaceResult?.status === "anchored") {
    return whitespaceResult;
  }
  if (whitespaceResult?.status === "ambiguous") {
    return whitespaceResult;
  }
  if (ambiguousResult) {
    return ambiguousResult;
  }

  return whitespaceResult ?? { status: "not_found", strategy: "before" };
}
