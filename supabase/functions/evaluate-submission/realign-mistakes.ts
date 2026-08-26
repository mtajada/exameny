import {
  OPENAI_RESPONSES_MODEL,
  type OpenAIResponsesClient,
} from "../_shared/openai-responses.ts";
import {
  type NormalizedMistakeItem,
  normalizeWhitespaceForComparison,
} from "../_shared/mistakes.ts";
import { buildRealignPrompt } from "./realign-prompt.ts";
import {
  parseRealignResponsesPayload,
  REALIGN_RESPONSES_JSON_SCHEMA,
  type RealignResponseItem,
} from "./responses-contract.ts";

interface RealignMistakePayloadItem {
  id: string;
  anchorText: string;
  submissionAnchorText: string;
  originalAnchorStart: number;
  originalAnchorEnd: number;
  windowStart: number;
  windowEnd: number;
  contextBefore: string;
  contextAfter: string;
}

export interface RealignMetrics {
  total: number;
  aligned: number;
  unchanged: number;
  notFound: number;
  invalid: number;
  skipped: number;
  durationMs: number | null;
  correctionRatio: number | null;
  fallbackCount: number;
}

export interface RealignResult {
  items: NormalizedMistakeItem[];
  metrics: RealignMetrics;
}

type ResponsesClientLike = Pick<OpenAIResponsesClient, "generate">;

interface RealignMistakeSpansParams {
  aiClient: ResponsesClientLike;
  requestId: string;
  submissionText: string;
  items: NormalizedMistakeItem[];
}

const REALIGN_WINDOW_RADIUS = 120;
const MAX_SUBMISSION_LENGTH = 6_000;
const MAX_CONTEXT_LENGTH = 160;
const MIN_MATCH_LENGTH = 1;
const RESPONSE_MAX_TOKENS = 800;
const REALIGN_TIMEOUT_MS = 20_000;
const REALIGN_STATUS_INVALID = "invalid";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trimContext(
  value: string,
  maxLength: number,
  takeFromEnd = false,
): string {
  if (value.length <= maxLength) {
    return value;
  }
  return takeFromEnd
    ? value.slice(value.length - maxLength)
    : value.slice(0, maxLength);
}

function resolveReportedAnchorText(item: NormalizedMistakeItem): string {
  const meta = item.meta;
  const rawAdjustment = meta?.["anchor_text_adjustment"];
  if (isPlainRecord(rawAdjustment)) {
    const adjustment = rawAdjustment;
    const reportedAnchorText = adjustment.reportedAnchorText;
    if (
      typeof reportedAnchorText === "string" &&
      reportedAnchorText.trim().length > 0
    ) {
      return reportedAnchorText.trim();
    }
    const originalAnchorText = adjustment.originalAnchorText;
    if (
      typeof originalAnchorText === "string" &&
      originalAnchorText.trim().length > 0
    ) {
      return originalAnchorText.trim();
    }
  }
  return item.anchorText;
}

function buildPayloadItems(
  submissionText: string,
  items: NormalizedMistakeItem[],
): {
  payload: RealignMistakePayloadItem[];
  idMap: Map<string, {
    index: number;
    originalStart: number;
    originalEnd: number;
    windowStart: number;
    windowEnd: number;
    submissionAnchorText: string;
    reportedAnchorText: string;
  }>;
} {
  const payload: RealignMistakePayloadItem[] = [];
  const idMap = new Map<string, {
    index: number;
    originalStart: number;
    originalEnd: number;
    windowStart: number;
    windowEnd: number;
    submissionAnchorText: string;
    reportedAnchorText: string;
  }>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const id = `mistake_${index}`;
    const originalStart = clamp(item.anchorStart, 0, submissionText.length);
    const originalEnd = clamp(item.anchorEnd, 0, submissionText.length);
    const windowStart = clamp(
      originalStart - REALIGN_WINDOW_RADIUS,
      0,
      submissionText.length,
    );
    const windowEnd = clamp(
      originalEnd + REALIGN_WINDOW_RADIUS,
      0,
      submissionText.length,
    );
    const contextBefore = submissionText.slice(windowStart, originalStart);
    const contextAfter = submissionText.slice(originalEnd, windowEnd);
    const reportedAnchorText = resolveReportedAnchorText(item);

    payload.push({
      id,
      anchorText: reportedAnchorText,
      submissionAnchorText: item.anchorText,
      originalAnchorStart: originalStart,
      originalAnchorEnd: originalEnd,
      windowStart,
      windowEnd,
      contextBefore: trimContext(contextBefore, MAX_CONTEXT_LENGTH, true),
      contextAfter: trimContext(contextAfter, MAX_CONTEXT_LENGTH, false),
    });

    idMap.set(id, {
      index,
      originalStart,
      originalEnd,
      windowStart,
      windowEnd,
      submissionAnchorText: item.anchorText,
      reportedAnchorText,
    });
  }

  return { payload, idMap };
}

function ensureAnchorAdjustmentMeta(
  target: NormalizedMistakeItem,
  originalStart: number,
  originalEnd: number,
  submissionAnchorText: string,
  reportedAnchorText: string,
): Record<string, unknown> {
  const meta = target.meta;
  const existing = meta["anchor_text_adjustment"];
  const base: Record<string, unknown> = isPlainRecord(existing)
    ? { ...existing }
    : {};
  const trimmedReported = typeof reportedAnchorText === "string"
    ? reportedAnchorText.trim()
    : "";
  const fallbackOriginalText = trimmedReported.length > 0
    ? trimmedReported
    : submissionAnchorText;

  if (typeof base.originalAnchorStart !== "number") {
    base.originalAnchorStart = originalStart;
  }
  if (typeof base.originalAnchorEnd !== "number") {
    base.originalAnchorEnd = originalEnd;
  }
  if (
    typeof base.originalAnchorText !== "string" ||
    base.originalAnchorText === ""
  ) {
    base.originalAnchorText = fallbackOriginalText;
  }
  if (
    trimmedReported.length > 0 &&
    (typeof base.reportedAnchorText !== "string" ||
      base.reportedAnchorText === "")
  ) {
    base.reportedAnchorText = trimmedReported;
  }

  const normalizedOriginal = normalizeWhitespaceForComparison(
    typeof base.originalAnchorText === "string"
      ? base.originalAnchorText
      : fallbackOriginalText,
  );
  const normalizedTarget = normalizeWhitespaceForComparison(
    submissionAnchorText,
  );

  if (
    typeof base.normalizedOriginal !== "string" ||
    base.normalizedOriginal === ""
  ) {
    base.normalizedOriginal = normalizedOriginal;
  }
  if (
    typeof base.normalizedTarget !== "string" || base.normalizedTarget === ""
  ) {
    base.normalizedTarget = normalizedTarget;
  }
  if (base.strategy !== "substring" && base.strategy !== "levenshtein") {
    base.strategy = normalizedOriginal === normalizedTarget
      ? "substring"
      : "levenshtein";
  }
  if (typeof base.distance !== "number" || !Number.isFinite(base.distance)) {
    base.distance = normalizedOriginal === normalizedTarget ? 0 : Math.max(
      1,
      Math.abs(normalizedTarget.length - normalizedOriginal.length),
    );
  }

  meta["anchor_text_adjustment"] = base;
  return base;
}

function validateOffsets(options: {
  submissionText: string;
  item: RealignResponseItem;
  original: {
    originalStart: number;
    originalEnd: number;
    windowStart: number;
    windowEnd: number;
    submissionAnchorText: string;
    reportedAnchorText: string;
  };
  accepted: Array<{ start: number; end: number; id: string }>;
}): {
  valid: boolean;
  start: number;
  end: number;
  matchedText: string | null;
  failure?: string;
} {
  const { submissionText, item, original, accepted } = options;

  if (item.status === "not_found") {
    return {
      valid: false,
      start: original.originalStart,
      end: original.originalEnd,
      matchedText: null,
      failure: "not_found",
    };
  }

  const nonIntegerStart = item.anchorStart !== undefined &&
    !Number.isInteger(item.anchorStart);
  const nonIntegerEnd = item.anchorEnd !== undefined &&
    !Number.isInteger(item.anchorEnd);
  if (nonIntegerStart || nonIntegerEnd) {
    return {
      valid: false,
      start: original.originalStart,
      end: original.originalEnd,
      matchedText: null,
      failure: "non_integer_offset",
    };
  }

  if (item.status === "unchanged") {
    if (
      item.anchorStart !== original.originalStart ||
      item.anchorEnd !== original.originalEnd
    ) {
      return {
        valid: false,
        start: original.originalStart,
        end: original.originalEnd,
        matchedText: null,
        failure: "unchanged_offsets_mismatch",
      };
    }
  }

  const start = clamp(
    item.anchorStart ?? original.originalStart,
    0,
    submissionText.length,
  );
  const end = clamp(
    item.anchorEnd ?? original.originalEnd,
    0,
    submissionText.length,
  );
  if (start >= end) {
    return {
      valid: false,
      start: original.originalStart,
      end: original.originalEnd,
      matchedText: null,
      failure: "invalid_span",
    };
  }

  if (start < original.windowStart || end > original.windowEnd) {
    return {
      valid: false,
      start: original.originalStart,
      end: original.originalEnd,
      matchedText: null,
      failure: "outside_window",
    };
  }

  const matchedText = submissionText.slice(start, end);
  if (matchedText.length < MIN_MATCH_LENGTH) {
    return {
      valid: false,
      start: original.originalStart,
      end: original.originalEnd,
      matchedText: null,
      failure: "empty_match",
    };
  }

  if (item.matchedText !== undefined && matchedText !== item.matchedText) {
    return {
      valid: false,
      start: original.originalStart,
      end: original.originalEnd,
      matchedText,
      failure: "mismatch_text",
    };
  }

  for (const existing of accepted) {
    if (start < existing.end && end > existing.start) {
      return {
        valid: false,
        start: original.originalStart,
        end: original.originalEnd,
        matchedText,
        failure: "overlap",
      };
    }
  }

  return { valid: true, start, end, matchedText };
}

function annotateSkippedRealignment(
  submissionText: string,
  items: NormalizedMistakeItem[],
  note: string,
): NormalizedMistakeItem[] {
  return items.map((item) => {
    const updated = { ...item, meta: item.meta ? { ...item.meta } : {} };
    const anchorSlice = item.anchorEnd > item.anchorStart &&
        item.anchorEnd <= submissionText.length
      ? submissionText.slice(item.anchorStart, item.anchorEnd)
      : item.anchorText;
    const anchorMeta = ensureAnchorAdjustmentMeta(
      updated,
      item.anchorStart,
      item.anchorEnd,
      anchorSlice,
      resolveReportedAnchorText(item),
    );
    anchorMeta.realignmentStatus = "skipped";
    anchorMeta.realignmentNotes = note;
    delete anchorMeta.adjustedAnchorStart;
    delete anchorMeta.adjustedAnchorEnd;
    updated.meta["anchor_text_adjustment"] = anchorMeta;
    return updated;
  });
}

export async function realignMistakeSpans(
  params: RealignMistakeSpansParams,
): Promise<RealignResult> {
  const { aiClient, submissionText, items } = params;
  const metrics: RealignMetrics = {
    total: items.length,
    aligned: 0,
    unchanged: 0,
    notFound: 0,
    invalid: 0,
    skipped: 0,
    durationMs: null,
    correctionRatio: null,
    fallbackCount: 0,
  };

  if (items.length === 0) {
    return { items, metrics };
  }

  if (submissionText.length === 0) {
    console.warn(
      "[evaluate-submission][realign] Skipping realignment due to empty submission text.",
    );
    metrics.skipped = items.length;
    const updatedItems = annotateSkippedRealignment(
      submissionText,
      items,
      "skipped_empty_submission_text",
    );
    return { items: updatedItems, metrics };
  }

  if (submissionText.length > MAX_SUBMISSION_LENGTH) {
    console.warn(
      `[evaluate-submission][realign] Skipping realignment because submission text exceeds ${MAX_SUBMISSION_LENGTH} characters.`,
      { length: submissionText.length },
    );
    metrics.skipped = items.length;
    const updatedItems = annotateSkippedRealignment(
      submissionText,
      items,
      "skipped_submission_text_too_long",
    );
    return { items: updatedItems, metrics };
  }

  const { payload, idMap } = buildPayloadItems(submissionText, items);
  const prompt = buildRealignPrompt({
    submissionText,
    mistakesJson: JSON.stringify(payload, null, 2),
  });

  const responseResult = await aiClient.generate({
    instructions: prompt.systemPrompt,
    input: [{ role: "user", content: prompt.userPrompt }],
    schemaName: "exameny_realign_v1",
    schema: REALIGN_RESPONSES_JSON_SCHEMA,
    parse: parseRealignResponsesPayload,
    reasoningEffort: "medium",
    maxOutputTokens: RESPONSE_MAX_TOKENS,
    timeoutMs: REALIGN_TIMEOUT_MS,
  });
  metrics.durationMs = responseResult.latencyMs;

  let parsedItems: RealignResponseItem[];
  switch (responseResult.kind) {
    case "completed":
      parsedItems = responseResult.data.items;
      break;
    case "incomplete":
      throw new Error(
        `Realign response was incomplete (${responseResult.reason}).`,
      );
    case "refusal":
      throw new Error("Realign response was refused.");
    case "failed":
      throw new Error(`Realign request failed (${responseResult.code}).`);
  }

  if (parsedItems.length !== payload.length) {
    throw new Error(
      `Realign model returned ${parsedItems.length} items but ${payload.length} were requested.`,
    );
  }

  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const unexpectedIds = new Set<string>();

  for (const item of parsedItems) {
    if (!idMap.has(item.id)) {
      unexpectedIds.add(item.id);
      continue;
    }
    if (seenIds.has(item.id)) {
      duplicateIds.add(item.id);
    }
    seenIds.add(item.id);
  }

  const missingIds: string[] = [];
  for (const id of idMap.keys()) {
    if (!seenIds.has(id)) {
      missingIds.push(id);
    }
  }

  if (
    duplicateIds.size > 0 || unexpectedIds.size > 0 || missingIds.length > 0
  ) {
    const details: string[] = [];
    if (duplicateIds.size > 0) {
      details.push(`${duplicateIds.size} duplicate id(s)`);
    }
    if (missingIds.length > 0) {
      details.push(`${missingIds.length} missing id(s)`);
    }
    if (unexpectedIds.size > 0) {
      details.push(`${unexpectedIds.size} unexpected id(s)`);
    }
    throw new Error(
      `Realign model returned inconsistent ids (${details.join("; ")}).`,
    );
  }

  const acceptedRanges: Array<{ start: number; end: number; id: string }> = [];
  const updatedItems = items.map((item) => ({
    ...item,
    meta: item.meta ? { ...item.meta } : {},
  }));

  for (const modelItem of parsedItems) {
    const original = idMap.get(modelItem.id);
    if (!original) {
      metrics.invalid += 1;
      console.warn(
        "[evaluate-submission][realign] Unknown item id returned by model.",
      );
      continue;
    }

    const updated = updatedItems[original.index];
    if (!updated) {
      metrics.invalid += 1;
      console.error(
        "[evaluate-submission][realign] Internal item mapping failed.",
      );
      continue;
    }

    const { valid, start, end, matchedText, failure } = validateOffsets({
      submissionText,
      item: modelItem,
      original,
      accepted: acceptedRanges,
    });

    if (!valid) {
      const anchorMeta = ensureAnchorAdjustmentMeta(
        updated,
        original.originalStart,
        original.originalEnd,
        original.submissionAnchorText,
        original.reportedAnchorText,
      );
      anchorMeta.realignmentStatus = failure === "not_found"
        ? "not_found"
        : REALIGN_STATUS_INVALID;
      anchorMeta.realignmentModel = OPENAI_RESPONSES_MODEL;
      if (
        modelItem.notes && typeof modelItem.notes === "string" &&
        modelItem.notes.trim().length > 0
      ) {
        anchorMeta.realignmentNotes = modelItem.notes.trim();
      } else if (failure && failure !== "not_found") {
        anchorMeta.realignmentNotes = failure;
      }
      acceptedRanges.push({ start, end, id: modelItem.id });
      updated.meta["anchor_text_adjustment"] = anchorMeta;

      if (failure === "not_found") {
        metrics.notFound += 1;
      } else {
        metrics.invalid += 1;
        console.warn(
          "[evaluate-submission][realign] Rejected realign suggestion.",
        );
      }
      continue;
    }

    const anchorMeta = ensureAnchorAdjustmentMeta(
      updated,
      original.originalStart,
      original.originalEnd,
      original.submissionAnchorText,
      original.reportedAnchorText,
    );
    anchorMeta.realignmentModel = OPENAI_RESPONSES_MODEL;
    if (
      modelItem.notes && typeof modelItem.notes === "string" &&
      modelItem.notes.trim().length > 0
    ) {
      anchorMeta.realignmentNotes = modelItem.notes.trim();
    }
    if (start === original.originalStart && end === original.originalEnd) {
      metrics.unchanged += 1;
      anchorMeta.realignmentStatus = "unchanged";
      acceptedRanges.push({ start, end, id: modelItem.id });
      updated.meta["anchor_text_adjustment"] = anchorMeta;
      continue;
    }

    acceptedRanges.push({ start, end, id: modelItem.id });
    updated.anchorStart = start;
    updated.anchorEnd = end;
    if (matchedText) {
      updated.anchorText = matchedText;
    } else {
      updated.anchorText = submissionText.slice(start, end);
    }
    anchorMeta.adjustedAnchorStart = start;
    anchorMeta.adjustedAnchorEnd = end;
    anchorMeta.realignmentStatus = "aligned";
    updated.meta["anchor_text_adjustment"] = anchorMeta;
    metrics.aligned += 1;
  }

  const processed = metrics.total - metrics.skipped;
  metrics.fallbackCount = metrics.invalid + metrics.notFound;
  metrics.correctionRatio = processed > 0 ? metrics.aligned / processed : null;

  return { items: updatedItems, metrics };
}
