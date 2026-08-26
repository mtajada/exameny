import {
  type AnchorPatch,
  type AnchorResolution,
  type AnchorResolverOptions,
  resolveAnchorPatch,
} from "./anchor-resolver.ts";
import {
  type CanonicalCategory,
  type CanonicalFeatureTag,
  type CategoryRecord,
  MistakeValidationError,
  normalizeCategory,
  normalizeFeatureTags,
  normalizeSuggestedTag,
  type TagRecord,
} from "./mistakes.ts";
import { mistakesV2ItemSchemaLoose } from "../evaluate-submission/mistakes-v2.schema.ts";

export interface MistakesV2NormalizationContext {
  submissionText: string;
  categoriesByCode: Map<string, CategoryRecord>;
  tagsByCode: Map<string, TagRecord>;
  resolverOptions?: AnchorResolverOptions;
}

export interface NormalizedMistakeV2Item {
  category: CanonicalCategory;
  categoryId: number;
  featureTags: CanonicalFeatureTag[];
  primaryTag: CanonicalFeatureTag | null;
  primaryTagId: number | null;
  anchorPatch: AnchorPatch;
  anchorResolution: AnchorResolution;
  explanation: string;
  suggestedCorrection: string | null;
  suggestedTag: string | null;
  meta: Record<string, unknown>;
}

export interface NormalizedMistakesV2Metrics {
  total: number;
  anchored: number;
  ambiguous: number;
  not_found: number;
  invalid: number;
  resolverDurationMs: number;
  resolverVersion: number;
}

export interface NormalizedMistakesV2Result {
  items: NormalizedMistakeV2Item[];
  summary: {
    byCategory: Record<string, number>;
    byTag: Record<string, number>;
  };
  metrics: NormalizedMistakesV2Metrics;
}

interface NormalizedMistakeV2Candidate {
  category: CanonicalCategory;
  categoryId: number;
  featureTags: CanonicalFeatureTag[];
  extraFeatureTags: CanonicalFeatureTag[];
  primaryTag: CanonicalFeatureTag | null;
  primaryTagId: number | null;
  anchorPatch: AnchorPatch;
  anchorResolution: AnchorResolution;
  explanation: string;
  suggestedCorrection: string | null;
  suggestedTag: string | null;
  aliasHits: string[];
  normalizationNotes: string[];
  repeatCount: number;
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampContextBefore(
  value: string,
  maxLen: number,
): { value: string; truncated: boolean } {
  if (value.length <= maxLen) return { value, truncated: false };
  return { value: value.slice(value.length - maxLen), truncated: true };
}

function clampContextAfter(
  value: string,
  maxLen: number,
): { value: string; truncated: boolean } {
  if (value.length <= maxLen) return { value, truncated: false };
  return { value: value.slice(0, maxLen), truncated: true };
}

function clampAfter(
  value: string | null,
  maxLen: number,
): { value: string | null; truncated: boolean } {
  if (!value) return { value: null, truncated: false };
  if (value.length <= maxLen) return { value, truncated: false };
  return { value: null, truncated: true };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).filter((value) => value.length > 0);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isSafeInteger(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function resolvePrimaryTagId(
  primaryTag: CanonicalFeatureTag | null,
  categoryId: number,
  tagsByCode: Map<string, TagRecord>,
): number | null {
  if (!primaryTag) return null;
  const tagRecord = tagsByCode.get(primaryTag);
  if (!tagRecord) return null;
  if (tagRecord.category_id !== categoryId) return null;
  return tagRecord.id;
}

function resolveFeatureTagsForCategory(
  tags: CanonicalFeatureTag[],
  extra: CanonicalFeatureTag[],
  categoryId: number,
  tagsByCode: Map<string, TagRecord>,
): {
  featureTags: CanonicalFeatureTag[];
  extraFeatureTags: CanonicalFeatureTag[];
  primaryTag: CanonicalFeatureTag | null;
  primaryTagId: number | null;
  normalizationNotes: string[];
} {
  const normalizationNotes: string[] = [];
  const resolvedTags: CanonicalFeatureTag[] = [];
  const resolvedExtra: CanonicalFeatureTag[] = [];

  const resolveTag = (
    tag: CanonicalFeatureTag,
    target: CanonicalFeatureTag[],
  ) => {
    const tagRecord = tagsByCode.get(tag);
    if (!tagRecord) {
      normalizationNotes.push(`missing_feature_tag:${tag}`);
      return;
    }
    if (tagRecord.category_id !== categoryId) {
      normalizationNotes.push(`mismatched_feature_tag_omitted:${tag}`);
      return;
    }
    target.push(tag);
  };

  for (const tag of tags) {
    resolveTag(tag, resolvedTags);
  }

  for (const tag of extra) {
    resolveTag(tag, resolvedExtra);
  }

  let featureTags = uniqueStrings(resolvedTags) as CanonicalFeatureTag[];
  let extraFeatureTags = uniqueStrings(resolvedExtra) as CanonicalFeatureTag[];
  let promotedFromExtra = false;

  if (featureTags.length === 0 && extraFeatureTags.length > 0) {
    featureTags = extraFeatureTags.slice(0, 2);
    extraFeatureTags = extraFeatureTags.slice(2);
    promotedFromExtra = true;
  } else if (featureTags.length < 2 && extraFeatureTags.length > 0) {
    const needed = 2 - featureTags.length;
    const promotion = extraFeatureTags.slice(0, needed);
    if (promotion.length > 0) {
      featureTags = featureTags.concat(promotion);
      extraFeatureTags = extraFeatureTags.slice(needed);
      promotedFromExtra = true;
    }
  }

  if (promotedFromExtra) {
    normalizationNotes.push("primary_promoted_from_extra");
  }

  const primaryTag = featureTags[0] ?? null;
  const primaryTagId = resolvePrimaryTagId(primaryTag, categoryId, tagsByCode);

  return {
    featureTags,
    extraFeatureTags,
    primaryTag,
    primaryTagId,
    normalizationNotes,
  };
}

function normalizeCandidate(
  raw: unknown,
  context: MistakesV2NormalizationContext,
): NormalizedMistakeV2Candidate | null {
  const parsedV2 = mistakesV2ItemSchemaLoose.safeParse(raw);
  const v2Item = parsedV2.success ? parsedV2.data : null;

  const record = isPlainRecord(raw) ? raw : null;
  const legacyAnchorStart = record
    ? parseInteger(record.anchorStart ?? record.anchor_start)
    : null;
  const legacyAnchorEnd = record
    ? parseInteger(record.anchorEnd ?? record.anchor_end)
    : null;
  const legacyExplanation = record && typeof record.explanation === "string"
    ? record.explanation
    : null;

  const hasLegacyOffsets = legacyAnchorStart !== null &&
    legacyAnchorEnd !== null &&
    legacyAnchorStart >= 0 &&
    legacyAnchorEnd > legacyAnchorStart &&
    legacyAnchorEnd <= context.submissionText.length &&
    legacyExplanation !== null &&
    legacyExplanation.trim().length > 0;

  if (!v2Item && !hasLegacyOffsets) {
    return null;
  }

  try {
    const baseCategory = normalizeCategory(
      v2Item ? v2Item.category : record?.category,
    );
    const {
      category: resolvedCategory,
      tags,
      extra,
      aliasHits,
      categoryAdjustments,
    } = normalizeFeatureTags(
      v2Item
        ? v2Item.featureTags
        : (record?.featureTags ?? record?.feature_tags),
      baseCategory,
    );

    const categoryRecord = context.categoriesByCode.get(resolvedCategory);
    if (!categoryRecord) {
      throw new MistakeValidationError(
        `Category ${resolvedCategory} is not available in database.`,
      );
    }

    const tagResolution = resolveFeatureTagsForCategory(
      tags,
      extra,
      categoryRecord.id,
      context.tagsByCode,
    );

    const suggestedTag = normalizeSuggestedTag(
      v2Item
        ? v2Item.suggestedTag
        : (record?.suggestedTag ?? record?.suggested_tag),
    );
    const rawExplanation = v2Item ? v2Item.explanation : legacyExplanation;
    const explanation = typeof rawExplanation === "string"
      ? rawExplanation.trim()
      : "";
    if (!explanation) {
      throw new MistakeValidationError(
        "explanation must be a non-empty string.",
      );
    }

    let anchorPatch: AnchorPatch;
    let anchorResolution: AnchorResolution;
    let suggestedCorrection: string | null;
    const normalizationNotesExtra: string[] = [];

    if (v2Item) {
      const contextBeforeRaw = v2Item.anchorPatch.contextBefore ?? "";
      const contextAfterRaw = v2Item.anchorPatch.contextAfter ?? "";
      const clampedContextBefore = clampContextBefore(contextBeforeRaw, 40);
      const clampedContextAfter = clampContextAfter(contextAfterRaw, 40);
      const clampedAfter = clampAfter(
        normalizeOptionalText(v2Item.anchorPatch.after),
        120,
      );

      if (clampedContextBefore.truncated) {
        normalizationNotesExtra.push("context_before_truncated");
      }
      if (clampedContextAfter.truncated) {
        normalizationNotesExtra.push("context_after_truncated");
      }
      if (clampedAfter.truncated) {
        normalizationNotesExtra.push("after_omitted_too_long");
      }

      anchorPatch = {
        before: v2Item.anchorPatch.before,
        after: clampedAfter.value,
        contextBefore: clampedContextBefore.value,
        contextAfter: clampedContextAfter.value,
      };

      anchorResolution = resolveAnchorPatch(
        context.submissionText,
        anchorPatch,
        context.resolverOptions,
      );
      suggestedCorrection = anchorPatch.after ?? null;
    } else {
      const start = legacyAnchorStart!;
      const end = legacyAnchorEnd!;
      const before = context.submissionText.slice(start, end);
      const contextLen = 32;
      anchorPatch = {
        before,
        after: normalizeOptionalText(
          record?.suggestedCorrection ?? record?.suggested_correction,
        ),
        contextBefore: context.submissionText.slice(
          Math.max(0, start - contextLen),
          start,
        ),
        contextAfter: context.submissionText.slice(
          end,
          Math.min(context.submissionText.length, end + contextLen),
        ),
      };
      suggestedCorrection = anchorPatch.after ?? null;

      anchorResolution = {
        status: "anchored",
        start,
        end,
        strategy: "legacy_offsets",
        confidence: 1,
      };
      normalizationNotesExtra.push("legacy_offsets_fallback");
    }

    const normalizationNotes = uniqueStrings([
      ...categoryAdjustments,
      ...tagResolution.normalizationNotes,
      ...normalizationNotesExtra,
    ]);

    return {
      category: resolvedCategory,
      categoryId: categoryRecord.id,
      featureTags: tagResolution.featureTags,
      extraFeatureTags: tagResolution.extraFeatureTags,
      primaryTag: tagResolution.primaryTag,
      primaryTagId: tagResolution.primaryTagId,
      anchorPatch,
      anchorResolution,
      explanation,
      suggestedCorrection,
      suggestedTag,
      aliasHits,
      normalizationNotes,
      repeatCount: 1,
    };
  } catch (error) {
    if (error instanceof MistakeValidationError) {
      return null;
    }
    throw error;
  }
}

function buildDedupKey(item: NormalizedMistakeV2Candidate): string {
  if (item.anchorResolution.status === "anchored") {
    return `span:${item.anchorResolution.start}:${item.anchorResolution.end}`;
  }

  const patch = item.anchorPatch;
  return JSON.stringify([
    "patch",
    patch.before,
    patch.contextBefore ?? "",
    patch.contextAfter ?? "",
  ]);
}

function mergeCandidates(
  existing: NormalizedMistakeV2Candidate,
  incoming: NormalizedMistakeV2Candidate,
  context: MistakesV2NormalizationContext,
): NormalizedMistakeV2Candidate {
  const merged: NormalizedMistakeV2Candidate = { ...existing };
  merged.repeatCount = existing.repeatCount + incoming.repeatCount;
  merged.aliasHits = uniqueStrings([
    ...existing.aliasHits,
    ...incoming.aliasHits,
  ]);

  const normalizationNotes = uniqueStrings([
    ...existing.normalizationNotes,
    ...incoming.normalizationNotes,
  ]);

  if (existing.category !== incoming.category) {
    normalizationNotes.push(`category_conflict:${incoming.category}`);
  } else {
    const combinedTags = uniqueStrings([
      ...existing.featureTags,
      ...incoming.featureTags,
    ]) as CanonicalFeatureTag[];
    const combinedExtra = uniqueStrings([
      ...existing.extraFeatureTags,
      ...incoming.extraFeatureTags,
    ]) as CanonicalFeatureTag[];

    const resolved = resolveFeatureTagsForCategory(
      combinedTags,
      combinedExtra,
      existing.categoryId,
      context.tagsByCode,
    );
    merged.featureTags = resolved.featureTags;
    merged.extraFeatureTags = resolved.extraFeatureTags;
    merged.primaryTag = resolved.primaryTag;
    merged.primaryTagId = resolved.primaryTagId;
    normalizationNotes.push(...resolved.normalizationNotes);
  }

  merged.normalizationNotes = uniqueStrings(normalizationNotes);

  if (incoming.explanation.length > existing.explanation.length) {
    merged.explanation = incoming.explanation;
  }

  if (!merged.suggestedCorrection && incoming.suggestedCorrection) {
    merged.suggestedCorrection = incoming.suggestedCorrection;
  }

  if (!merged.suggestedTag && incoming.suggestedTag) {
    merged.suggestedTag = incoming.suggestedTag;
  }

  const existingPatchSignature = JSON.stringify(existing.anchorPatch);
  const incomingPatchSignature = JSON.stringify(incoming.anchorPatch);
  if (existingPatchSignature !== incomingPatchSignature) {
    merged.normalizationNotes = uniqueStrings([
      ...merged.normalizationNotes,
      "anchor_patch_conflict",
    ]);
  }

  const existingResolutionSignature = JSON.stringify(existing.anchorResolution);
  const incomingResolutionSignature = JSON.stringify(incoming.anchorResolution);
  if (existingResolutionSignature !== incomingResolutionSignature) {
    merged.normalizationNotes = uniqueStrings([
      ...merged.normalizationNotes,
      "anchor_resolution_conflict",
    ]);
  }

  return merged;
}

function dedupeCandidates(
  candidates: NormalizedMistakeV2Candidate[],
  context: MistakesV2NormalizationContext,
): NormalizedMistakeV2Candidate[] {
  const deduped = new Map<string, NormalizedMistakeV2Candidate>();

  for (const candidate of candidates) {
    const key = buildDedupKey(candidate);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, candidate);
      continue;
    }
    deduped.set(key, mergeCandidates(existing, candidate, context));
  }

  return Array.from(deduped.values());
}

function buildMeta(
  item: NormalizedMistakeV2Candidate,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (item.featureTags.length > 0) {
    meta.feature_tags = item.featureTags;
  }
  if (item.extraFeatureTags.length > 0) {
    meta.truncated_feature_tags = item.extraFeatureTags;
  }
  if (item.aliasHits.length > 0) {
    meta.alias_hits = item.aliasHits;
  }
  if (item.normalizationNotes.length > 0) {
    meta.normalization_notes = item.normalizationNotes;
  }
  if (item.suggestedTag) {
    meta.suggested_tag = item.suggestedTag;
  }
  if (item.repeatCount > 1) {
    meta.repeat_count = item.repeatCount;
  }
  return meta;
}

function buildSummary(items: NormalizedMistakeV2Item[]) {
  const byCategory: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    for (const tag of item.featureTags) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }

  return { byCategory, byTag };
}

function countByResolution(items: NormalizedMistakeV2Item[]) {
  let anchored = 0;
  let ambiguous = 0;
  let notFound = 0;
  let invalid = 0;

  for (const item of items) {
    switch (item.anchorResolution.status) {
      case "anchored":
        anchored += 1;
        break;
      case "ambiguous":
        ambiguous += 1;
        break;
      case "not_found":
        notFound += 1;
        break;
      case "invalid":
        invalid += 1;
        break;
    }
  }

  return { anchored, ambiguous, notFound, invalid };
}

export function normalizeMistakesPayloadV2(
  payload: unknown,
  context: MistakesV2NormalizationContext,
): NormalizedMistakesV2Result {
  if (!isPlainRecord(payload)) {
    throw new MistakeValidationError("Mistakes payload must be an object.");
  }

  const source = payload;
  const hasItems = Object.prototype.hasOwnProperty.call(source, "items");
  if (!hasItems || source.items === undefined || source.items === null) {
    throw new MistakeValidationError("mistakes.items is required.");
  }

  const rawItems = source.items;
  if (!Array.isArray(rawItems)) {
    throw new MistakeValidationError("mistakes.items must be an array.");
  }

  const resolverStart = Date.now();
  const candidates: NormalizedMistakeV2Candidate[] = [];
  let invalidCount = 0;

  for (const rawItem of rawItems) {
    const candidate = normalizeCandidate(rawItem, context);
    if (!candidate) {
      invalidCount += 1;
      continue;
    }
    candidates.push(candidate);
  }

  const deduped = dedupeCandidates(candidates, context);
  const items: NormalizedMistakeV2Item[] = deduped.map((item) => ({
    category: item.category,
    categoryId: item.categoryId,
    featureTags: item.featureTags,
    primaryTag: item.primaryTag,
    primaryTagId: item.primaryTagId,
    anchorPatch: item.anchorPatch,
    anchorResolution: item.anchorResolution,
    explanation: item.explanation,
    suggestedCorrection: item.suggestedCorrection,
    suggestedTag: item.suggestedTag,
    meta: buildMeta(item),
  }));

  const summary = buildSummary(items);
  const resolutionCounts = countByResolution(items);
  const resolverDurationMs = Date.now() - resolverStart;

  const invalidTotal = resolutionCounts.invalid + invalidCount;

  const metrics: NormalizedMistakesV2Metrics = {
    total: resolutionCounts.anchored + resolutionCounts.ambiguous +
      resolutionCounts.notFound + invalidTotal,
    anchored: resolutionCounts.anchored,
    ambiguous: resolutionCounts.ambiguous,
    not_found: resolutionCounts.notFound,
    invalid: invalidTotal,
    resolverDurationMs,
    resolverVersion: 2,
  };

  return { items, summary, metrics };
}
