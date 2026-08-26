import {
  ALLOWED_FEATURE_TAGS,
  ALLOWED_MISTAKE_CATEGORIES,
} from "../evaluate-submission/prompt.ts";

export class MistakeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MistakeValidationError";
  }
}

export type CanonicalCategory = typeof ALLOWED_MISTAKE_CATEGORIES[number];
export type CanonicalFeatureTag = typeof ALLOWED_FEATURE_TAGS[number];

export interface AiMistakeItem {
  category: string;
  featureTags?: unknown;
  anchorText: unknown;
  anchorStart: unknown;
  anchorEnd: unknown;
  suggestedCorrection?: unknown;
  explanation: unknown;
  suggestedTag?: unknown;
}

export interface AiMistakesPayload {
  items?: unknown;
  summary?: unknown;
}

export interface CategoryRecord {
  id: number;
  code: string;
}

export interface TagRecord {
  id: number;
  code: string;
  category_id: number;
}

export interface MistakeNormalizationContext {
  submissionText: string;
  categoriesByCode: Map<string, CategoryRecord>;
  tagsByCode: Map<string, TagRecord>;
}

export interface NormalizedMistakeItem {
  categoryCode: CanonicalCategory;
  categoryId: number;
  featureTags: CanonicalFeatureTag[];
  primaryTagCode: CanonicalFeatureTag | null;
  primaryTagId: number | null;
  anchorText: string;
  anchorStart: number;
  anchorEnd: number;
  suggestedCorrection: string | null;
  explanation: string;
  suggestedTag: string | null;
  meta: Record<string, unknown>;
}

export interface NormalizedMistakesResult {
  items: NormalizedMistakeItem[];
  summary: {
    byCategory: Record<string, number>;
    byTag: Record<string, number>;
  };
}

export const SHORT_SUBMISSION_WORD_THRESHOLD = 40;

// PRD Mistakes Analysis §6: under 40 words we keep TA.WORD_COUNT plus critical blockers only.
const SHORT_SUBMISSION_ALLOWED_TAGS_BY_CATEGORY = new Map<
  CanonicalCategory,
  Set<CanonicalFeatureTag>
>([
  ["TA", new Set<CanonicalFeatureTag>(["WORD_COUNT"])],
  [
    "GR",
    new Set<CanonicalFeatureTag>([
      "SVA",
      "VERB_FORM",
      "TENSE_ASPECT",
      "WORD_ORDER",
    ]),
  ],
  ["LX", new Set<CanonicalFeatureTag>(["WORD_CHOICE"])],
  ["DC", new Set<CanonicalFeatureTag>(["SENTENCE_BOUNDARY"])],
]);

export function validateShortSubmissionMistakes(
  items: Array<Pick<NormalizedMistakeItem, "categoryCode" | "featureTags">>,
  wordCount: number,
) {
  if (wordCount >= SHORT_SUBMISSION_WORD_THRESHOLD) {
    return { ok: true, offendingItems: [] as NormalizedMistakeItem[] };
  }

  const offendingItems = items.filter((item) => {
    const allowedTags = SHORT_SUBMISSION_ALLOWED_TAGS_BY_CATEGORY.get(
      item.categoryCode,
    );
    if (!allowedTags) {
      return true;
    }

    if (item.featureTags.length === 0) {
      return true;
    }

    if (item.categoryCode === "TA") {
      const hasWordCount = item.featureTags.includes("WORD_COUNT");
      if (!hasWordCount) {
        return true;
      }

      return item.featureTags.some((tag) => tag !== "WORD_COUNT");
    }

    return item.featureTags.some((tag) => !allowedTags.has(tag));
  });

  return { ok: offendingItems.length === 0, offendingItems };
}

type MergeDecisionReason =
  | "precedence"
  | "feature-tag-count"
  | "explanation-length";

interface MergeOutcome {
  winner: "existing" | "incoming";
  reason: MergeDecisionReason;
}

interface AnchorTextAdjustmentMeta {
  originalAnchorText: string;
  normalizedOriginal: string;
  normalizedTarget: string;
  distance: number;
  strategy: "substring" | "levenshtein";
  originalAnchorStart?: number;
  originalAnchorEnd?: number;
  reportedAnchorText?: string;
  adjustedAnchorStart?: number;
  adjustedAnchorEnd?: number;
  realignmentStatus?:
    | "aligned"
    | "unchanged"
    | "not_found"
    | "invalid"
    | "skipped";
  realignmentModel?: string;
  realignmentNotes?: string | null;
}

interface NormalizedCandidate {
  categoryCode: CanonicalCategory;
  featureTags: CanonicalFeatureTag[];
  extraFeatureTags: CanonicalFeatureTag[];
  anchorText: string;
  anchorStart: number;
  anchorEnd: number;
  explanation: string;
  suggestedCorrection: string | null;
  suggestedTag: string | null;
  normalizedAnchorKey: string | null;
  aliasHits: string[];
  categoryAdjustments: string[];
  repeatCount: number;
  anchorAdjustment?: AnchorTextAdjustmentMeta;
}

function sanitizeToken(value: string): string {
  const withoutDiacritics = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return withoutDiacritics.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

const CATEGORY_SYNONYM_ENTRIES: Array<[string, CanonicalCategory]> = [
  ["GRAMMAR", "GR"],
  ["GRAMATICA", "GR"],
  ["LEXIS", "LX"],
  ["LEXICAL", "LX"],
  ["LEXICO", "LX"],
  ["LEXICOLOGY", "LX"],
  ["MECHANICS", "ME"],
  ["ORTHOGRAPHY", "ME"],
  ["DISCOURSE", "DC"],
  ["COHESION", "DC"],
  ["REGISTER_STYLE", "RS"],
  ["REGISTER", "RS"],
  ["STYLE", "RS"],
  ["TASK", "TA"],
  ["TASK_REQUIREMENTS", "TA"],
];

const CATEGORY_SYNONYMS = new Map<string, CanonicalCategory>(
  CATEGORY_SYNONYM_ENTRIES.map(([key, value]) => [sanitizeToken(key), value]),
);

const TAG_CATEGORY_LOOKUP = new Map<CanonicalFeatureTag, CanonicalCategory>([
  ["TENSE_ASPECT", "GR"],
  ["VERB_FORM", "GR"],
  ["GERUND_INFINITIVE", "GR"],
  ["SVA", "GR"],
  ["ARTICLE", "GR"],
  ["DETERMINER", "GR"],
  ["PREPOSITION", "GR"],
  ["PRONOUN", "GR"],
  ["WORD_ORDER", "GR"],
  ["COMPARATIVE", "GR"],
  ["CONDITIONAL", "GR"],
  ["PASSIVE", "GR"],
  ["REPORTED_SPEECH", "GR"],
  ["TENSE_SEQUENCE", "GR"],
  ["RELATIVE_CLAUSE", "GR"],
  ["NEGATION", "GR"],
  ["QUANTIFIER", "GR"],
  ["MODAL", "GR"],
  ["QUESTION_FORM", "GR"],
  ["PARTICIPLE_CLAUSE", "GR"],
  ["INVERSION", "GR"],
  ["CLAUSE_SUBORDINATION", "GR"],
  ["SUBJUNCTIVE", "GR"],
  ["WORD_CHOICE", "LX"],
  ["COLLOCATION", "LX"],
  ["PHRASAL_VERB", "LX"],
  ["WORD_FORMATION", "LX"],
  ["DEPENDENT_PREPOSITION", "LX"],
  ["COUNTABILITY", "LX"],
  ["FALSE_FRIEND", "LX"],
  ["HOMOPHONE_CHOICE", "LX"],
  ["IDIOM", "LX"],
  ["SPELLING", "ME"],
  ["PUNCTUATION", "ME"],
  ["CAPITALIZATION", "ME"],
  ["HYPHENATION", "ME"],
  ["APOSTROPHE", "ME"],
  ["COMMA_RULE", "ME"],
  ["QUOTATION_MARKS", "ME"],
  ["COHESIVE_DEVICE", "DC"],
  ["REFERENCE", "DC"],
  ["SENTENCE_BOUNDARY", "DC"],
  ["PARAGRAPHING", "DC"],
  ["LOGICAL_COHERENCE", "DC"],
  ["MISUSED_CONNECTOR", "DC"],
  ["TOPIC_SENTENCE_MISSING", "DC"],
  ["COHERENCE_JUMP", "DC"],
  ["REGISTER", "RS"],
  ["CONCISION", "RS"],
  ["TONE_POLITENESS", "RS"],
  ["HEDGING", "RS"],
  ["WORD_COUNT", "TA"],
  ["UNDERLENGTH", "TA"],
  ["OVERLENGTH", "TA"],
  ["TASK_COVERAGE", "TA"],
  ["MISSING_BULLET", "TA"],
  ["OFF_TOPIC", "TA"],
  ["IMBALANCED_COVERAGE", "TA"],
  ["FORMAT", "TA"],
  ["GENRE_CONVENTIONS_ISSUE", "TA"],
]);

const TAG_ALIAS_LOOKUP = new Map<
  string,
  { category: CanonicalCategory; tag: CanonicalFeatureTag }
>([
  ["WRONG_TENSE", { category: "GR", tag: "TENSE_ASPECT" }],
  ["INCORRECT_TENSE", { category: "GR", tag: "TENSE_ASPECT" }],
  ["WRONG_VERB_FORM", { category: "GR", tag: "VERB_FORM" }],
  ["VERB_ENDING", { category: "GR", tag: "VERB_FORM" }],
  ["SVA_ERROR", { category: "GR", tag: "SVA" }],
  ["SUBJECT_VERB_AGREEMENT", { category: "GR", tag: "SVA" }],
  ["WORD_CHOICE_ERROR", { category: "LX", tag: "WORD_CHOICE" }],
  ["VOCAB_MISUSE", { category: "LX", tag: "WORD_CHOICE" }],
  ["DEP_PREP_ERROR", { category: "LX", tag: "DEPENDENT_PREPOSITION" }],
  ["PREP_PATTERN", { category: "LX", tag: "DEPENDENT_PREPOSITION" }],
  ["COMMA_SPLICE", { category: "DC", tag: "SENTENCE_BOUNDARY" }],
  ["RUN_ON", { category: "DC", tag: "SENTENCE_BOUNDARY" }],
  ["INFORMAL_REGISTER", { category: "RS", tag: "REGISTER" }],
  ["WRONG_TONE", { category: "RS", tag: "REGISTER" }],
  ["TOO_WORDY", { category: "RS", tag: "CONCISION" }],
  ["REDUNDANT", { category: "RS", tag: "CONCISION" }],
  ["OFF_TOPIC_CONTENT", { category: "TA", tag: "OFF_TOPIC" }],
  ["IRRELEVANT_POINT", { category: "TA", tag: "OFF_TOPIC" }],
  ["MISSING_POINT", { category: "TA", tag: "MISSING_BULLET" }],
  ["BULLET_SKIPPED", { category: "TA", tag: "MISSING_BULLET" }],
]);

const PRECEDENCE_RULES: Array<{
  winner: { category: CanonicalCategory; tag: CanonicalFeatureTag };
  loser: { category: CanonicalCategory; tag: CanonicalFeatureTag };
}> = [
  {
    winner: { category: "LX", tag: "DEPENDENT_PREPOSITION" },
    loser: { category: "GR", tag: "PREPOSITION" },
  },
  {
    winner: { category: "DC", tag: "SENTENCE_BOUNDARY" },
    loser: { category: "ME", tag: "COMMA_RULE" },
  },
  {
    winner: { category: "GR", tag: "VERB_FORM" },
    loser: { category: "LX", tag: "WORD_CHOICE" },
  },
  {
    winner: { category: "GR", tag: "WORD_ORDER" },
    loser: { category: "RS", tag: "CONCISION" },
  },
];

function normalizeAnchorKey(text: string | null): string | null {
  if (!text) return null;
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeWhitespaceForComparison(text: string): string {
  let normalized = text.normalize("NFKC");

  normalized = normalized
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, "")
    .replace(/\u00AD/g, "");

  return normalized.replace(/\s+/g, " ").trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const aLength = a.length;
  const bLength = b.length;
  if (aLength === 0) return bLength;
  if (bLength === 0) return aLength;

  const previousRow = Array.from({ length: bLength + 1 }, (_, index) => index);
  const currentRow = new Array<number>(bLength + 1);

  for (let i = 1; i <= aLength; i += 1) {
    currentRow[0] = i;
    const aChar = a.charAt(i - 1);

    for (let j = 1; j <= bLength; j += 1) {
      const bChar = b.charAt(j - 1);
      const substitutionCost = aChar === bChar ? 0 : 1;
      currentRow[j] = Math.min(
        currentRow[j - 1] + 1,
        previousRow[j] + 1,
        previousRow[j - 1] + substitutionCost,
      );
    }

    for (let j = 0; j <= bLength; j += 1) {
      previousRow[j] = currentRow[j];
    }
  }

  return previousRow[bLength];
}

function assertNumber(value: unknown, field: string): number {
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

  throw new MistakeValidationError(`Field ${field} must be an integer.`);
}

export function normalizeCategory(raw: unknown): CanonicalCategory {
  if (typeof raw !== "string") {
    throw new MistakeValidationError(
      "Each mistake must include a category string.",
    );
  }

  const token = sanitizeToken(raw);
  if (ALLOWED_MISTAKE_CATEGORIES.includes(token as CanonicalCategory)) {
    return token as CanonicalCategory;
  }

  const alias = CATEGORY_SYNONYMS.get(token);
  if (alias) {
    return alias;
  }

  throw new MistakeValidationError(`Unsupported mistake category: ${raw}`);
}

function resolveFeatureTag(
  raw: string,
): {
  tag: CanonicalFeatureTag;
  categoryOverride?: CanonicalCategory;
  aliasHit?: string;
} {
  const trimmedRaw = raw.trim();

  if (trimmedRaw.includes(".")) {
    const [rawCategoryToken, rawTagToken] = trimmedRaw.split(".", 2);
    const categoryToken = sanitizeToken(rawCategoryToken);
    const tagToken = sanitizeToken(rawTagToken);
    if (
      ALLOWED_MISTAKE_CATEGORIES.includes(categoryToken as CanonicalCategory) &&
      TAG_CATEGORY_LOOKUP.has(tagToken as CanonicalFeatureTag)
    ) {
      return {
        tag: tagToken as CanonicalFeatureTag,
        categoryOverride: categoryToken as CanonicalCategory,
      };
    }
  }

  const token = sanitizeToken(trimmedRaw);

  const alias = TAG_ALIAS_LOOKUP.get(token);
  if (alias) {
    return {
      tag: alias.tag,
      categoryOverride: alias.category,
      aliasHit: token,
    };
  }

  if (TAG_CATEGORY_LOOKUP.has(token as CanonicalFeatureTag)) {
    return { tag: token as CanonicalFeatureTag };
  }

  throw new MistakeValidationError(`Unsupported feature tag: ${raw}`);
}

export function normalizeFeatureTags(
  raw: unknown,
  category: CanonicalCategory,
) {
  if (raw === undefined || raw === null) {
    return {
      category,
      tags: [] as CanonicalFeatureTag[],
      extra: [] as CanonicalFeatureTag[],
      aliasHits: [] as string[],
      categoryAdjustments: [] as string[],
    };
  }

  if (!Array.isArray(raw)) {
    throw new MistakeValidationError(
      "featureTags must be an array of strings.",
    );
  }

  const tags: CanonicalFeatureTag[] = [];
  const extra: CanonicalFeatureTag[] = [];
  const aliasHits: string[] = [];
  const categoryAdjustments: string[] = [];

  let resolvedCategory: CanonicalCategory = category;
  let overrideApplied = false;

  for (const entry of raw) {
    if (typeof entry !== "string") {
      throw new MistakeValidationError("Each feature tag must be a string.");
    }
    const { tag, categoryOverride, aliasHit } = resolveFeatureTag(entry);
    if (aliasHit) {
      aliasHits.push(aliasHit);
    }
    const canonicalCategory = TAG_CATEGORY_LOOKUP.get(tag);
    if (categoryOverride && categoryOverride !== resolvedCategory) {
      if (!overrideApplied) {
        resolvedCategory = categoryOverride;
        overrideApplied = true;
        categoryAdjustments.push(`override:${categoryOverride}`);
      } else if (categoryOverride !== resolvedCategory) {
        categoryAdjustments.push(`extra_override:${categoryOverride}`);
      }
    } else if (canonicalCategory && canonicalCategory !== resolvedCategory) {
      if (!overrideApplied) {
        resolvedCategory = canonicalCategory;
        overrideApplied = true;
        categoryAdjustments.push(`inferred:${canonicalCategory}`);
      } else if (canonicalCategory !== resolvedCategory) {
        categoryAdjustments.push(`extra_inferred:${canonicalCategory}`);
      }
    }

    if (tags.includes(tag) || extra.includes(tag)) {
      continue;
    }

    if (tags.length < 2) {
      tags.push(tag);
    } else {
      extra.push(tag);
    }
  }

  return {
    category: resolvedCategory,
    tags,
    extra,
    aliasHits,
    categoryAdjustments,
  };
}

export function normalizeSuggestedTag(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new MistakeValidationError(
      "suggestedTag must be a string when provided.",
    );
  }
  const token = sanitizeToken(raw);
  return token.length > 0 ? token : null;
}

function normalizeMistakeCandidate(
  raw: unknown,
  submissionText: string,
): NormalizedCandidate {
  if (!raw || typeof raw !== "object") {
    throw new MistakeValidationError("Each mistake item must be an object.");
  }

  const item = raw as AiMistakeItem;

  const category = normalizeCategory(item.category);
  const {
    category: resolvedCategory,
    tags,
    extra,
    aliasHits,
    categoryAdjustments,
  } = normalizeFeatureTags(item.featureTags, category);

  const anchorStart = assertNumber(item.anchorStart, "anchorStart");
  const anchorEnd = assertNumber(item.anchorEnd, "anchorEnd");
  if (anchorStart < 0 || anchorEnd <= anchorStart) {
    throw new MistakeValidationError(
      "anchorStart must be >= 0 and anchorEnd must be greater than anchorStart.",
    );
  }
  if (anchorEnd > submissionText.length) {
    throw new MistakeValidationError("anchorEnd exceeds submission length.");
  }

  if (
    typeof item.anchorText !== "string" || item.anchorText.trim().length === 0
  ) {
    throw new MistakeValidationError("anchorText must be a non-empty string.");
  }
  if (
    typeof item.explanation !== "string" || item.explanation.trim().length === 0
  ) {
    throw new MistakeValidationError("explanation must be a non-empty string.");
  }

  const submissionSlice = submissionText.slice(anchorStart, anchorEnd);
  const normalizedSlice = normalizeWhitespaceForComparison(submissionSlice);
  const normalizedAnchorText = normalizeWhitespaceForComparison(
    item.anchorText,
  );
  let anchorAdjustment: AnchorTextAdjustmentMeta | undefined;

  if (normalizedSlice.length === 0) {
    throw new MistakeValidationError(
      "anchorText must match the referenced submission span.",
    );
  }

  if (normalizedSlice !== normalizedAnchorText) {
    const distance = levenshteinDistance(normalizedSlice, normalizedAnchorText);
    const substringMatch = normalizedSlice.includes(normalizedAnchorText) ||
      normalizedAnchorText.includes(normalizedSlice);
    const withinDistanceThreshold = Number.isFinite(distance) && distance <= 2;

    if (substringMatch || withinDistanceThreshold) {
      const strategy: AnchorTextAdjustmentMeta["strategy"] = substringMatch
        ? "substring"
        : "levenshtein";
      console.warn(
        "[mistakes-normalization] Anchor text mismatch auto-corrected.",
      );
      anchorAdjustment = {
        originalAnchorText: item.anchorText,
        normalizedOriginal: normalizedAnchorText,
        normalizedTarget: normalizedSlice,
        distance,
        strategy,
      };
    } else {
      console.warn(
        "[mistakes-normalization] Anchor text mismatch detected.",
      );
      throw new MistakeValidationError(
        "anchorText must match the referenced submission span.",
      );
    }
  }

  const suggestedCorrection = (() => {
    if (
      item.suggestedCorrection === undefined ||
      item.suggestedCorrection === null
    ) return null;
    if (typeof item.suggestedCorrection !== "string") {
      throw new MistakeValidationError(
        "suggestedCorrection must be a string when provided.",
      );
    }
    const trimmed = item.suggestedCorrection.trim();
    return trimmed.length > 0 ? trimmed : null;
  })();

  const candidate: NormalizedCandidate = {
    categoryCode: resolvedCategory,
    featureTags: tags,
    extraFeatureTags: extra,
    anchorText: submissionSlice,
    anchorStart,
    anchorEnd,
    explanation: item.explanation.trim(),
    suggestedCorrection,
    suggestedTag: normalizeSuggestedTag(item.suggestedTag),
    normalizedAnchorKey: normalizeAnchorKey(item.anchorText),
    aliasHits,
    categoryAdjustments,
    repeatCount: 1,
    anchorAdjustment,
  };

  return candidate;
}

function shouldMerge(
  existing: NormalizedCandidate,
  incoming: NormalizedCandidate,
): boolean {
  if (existing.categoryCode === "TA" && incoming.categoryCode !== "TA") {
    return false;
  }
  if (incoming.categoryCode === "TA" && existing.categoryCode !== "TA") {
    return false;
  }

  const overlapStart = Math.max(existing.anchorStart, incoming.anchorStart);
  const overlapEnd = Math.min(existing.anchorEnd, incoming.anchorEnd);
  const spansOverlap = overlapEnd > overlapStart;
  const spansMatchExactly = existing.anchorStart === incoming.anchorStart &&
    existing.anchorEnd === incoming.anchorEnd;

  if (
    existing.normalizedAnchorKey && incoming.normalizedAnchorKey &&
    existing.normalizedAnchorKey === incoming.normalizedAnchorKey
  ) {
    return spansOverlap || spansMatchExactly;
  }

  if (!spansOverlap) return false;

  const overlapLength = overlapEnd - overlapStart;
  const minSpan = Math.min(
    existing.anchorEnd - existing.anchorStart,
    incoming.anchorEnd - incoming.anchorStart,
  );
  if (minSpan <= 0) return false;

  const ratio = overlapLength / minSpan;
  return ratio >= 0.7;
}

function matchesRule(
  candidate: NormalizedCandidate,
  spec: { category: CanonicalCategory; tag: CanonicalFeatureTag },
): boolean {
  return candidate.categoryCode === spec.category &&
    candidate.featureTags.includes(spec.tag);
}

function decideWinner(
  existing: NormalizedCandidate,
  incoming: NormalizedCandidate,
): MergeOutcome {
  for (const rule of PRECEDENCE_RULES) {
    const existingWins = matchesRule(existing, rule.winner) &&
      matchesRule(incoming, rule.loser);
    if (existingWins) return { winner: "existing", reason: "precedence" };
    const incomingWins = matchesRule(incoming, rule.winner) &&
      matchesRule(existing, rule.loser);
    if (incomingWins) return { winner: "incoming", reason: "precedence" };
  }

  if (incoming.featureTags.length > existing.featureTags.length) {
    return { winner: "incoming", reason: "feature-tag-count" };
  }
  if (incoming.featureTags.length < existing.featureTags.length) {
    return { winner: "existing", reason: "feature-tag-count" };
  }

  if (incoming.explanation.length > existing.explanation.length) {
    return { winner: "incoming", reason: "explanation-length" };
  }
  return { winner: "existing", reason: "explanation-length" };
}

function combineExplanations(primary: string, secondary: string): string {
  const trimmedPrimary = primary.trim();
  const trimmedSecondary = secondary.trim();
  if (trimmedPrimary.length === 0) return trimmedSecondary;
  if (trimmedSecondary.length === 0) return trimmedPrimary;
  if (trimmedPrimary === trimmedSecondary) return trimmedPrimary;
  if (trimmedPrimary.includes(trimmedSecondary)) return trimmedPrimary;
  if (trimmedSecondary.includes(trimmedPrimary)) return trimmedSecondary;

  const separator = /[.!?]$/.test(trimmedPrimary) ? " " : ". ";
  return `${trimmedPrimary}${separator}${trimmedSecondary}`.trim();
}

function mergeCandidates(
  existing: NormalizedCandidate,
  incoming: NormalizedCandidate,
) {
  const { winner, reason } = decideWinner(existing, incoming);
  const winnerSource = winner === "existing" ? existing : incoming;
  const loserSource = winner === "existing" ? incoming : existing;
  const trimmedWinnerExplanation = winnerSource.explanation.trim();
  const trimmedLoserExplanation = loserSource.explanation.trim();
  const loserHasRicherExplanation =
    trimmedLoserExplanation.length > trimmedWinnerExplanation.length;
  const shouldCombineBecauseOfPrecedence = reason === "precedence" &&
    loserHasRicherExplanation;
  let explanationOverride: string | null = null;
  if (shouldCombineBecauseOfPrecedence) {
    explanationOverride = combineExplanations(
      loserSource.explanation,
      winnerSource.explanation,
    );
  }

  const previousSuggestedTag = existing.suggestedTag;

  if (winner === "incoming") {
    existing.categoryCode = incoming.categoryCode;
    existing.anchorText = incoming.anchorText;
    existing.anchorStart = incoming.anchorStart;
    existing.anchorEnd = incoming.anchorEnd;
    existing.explanation = incoming.explanation;
    existing.suggestedCorrection = incoming.suggestedCorrection;
    existing.normalizedAnchorKey = incoming.normalizedAnchorKey;
    existing.suggestedTag = incoming.suggestedTag ?? previousSuggestedTag ??
      null;
  } else if (!existing.suggestedTag && incoming.suggestedTag) {
    existing.suggestedTag = incoming.suggestedTag;
  }

  const prioritizedTags = winner === "incoming"
    ? [...incoming.featureTags, ...existing.featureTags]
    : [...existing.featureTags, ...incoming.featureTags];
  const combinedTags: CanonicalFeatureTag[] = [];
  for (const tag of prioritizedTags) {
    if (!combinedTags.includes(tag)) {
      combinedTags.push(tag);
    }
  }
  existing.featureTags = combinedTags.slice(0, 2);

  const overflowTags = combinedTags.slice(2);
  const extraCombined = [...existing.extraFeatureTags];
  for (const tag of overflowTags) {
    if (!extraCombined.includes(tag)) {
      extraCombined.push(tag);
    }
  }
  for (const tag of incoming.extraFeatureTags) {
    if (!extraCombined.includes(tag)) {
      extraCombined.push(tag);
    }
  }
  existing.extraFeatureTags = extraCombined;

  const currentCorrection = existing.suggestedCorrection?.trim() ?? "";
  const loserCorrection = loserSource.suggestedCorrection?.trim() ?? "";
  if (
    loserCorrection.length > 0 &&
    (currentCorrection.length === 0 ||
      loserCorrection.length > currentCorrection.length)
  ) {
    existing.suggestedCorrection = loserSource.suggestedCorrection;
  }
  if (
    existing.suggestedCorrection &&
    existing.suggestedCorrection.trim().length === 0
  ) {
    existing.suggestedCorrection = null;
  }

  existing.aliasHits = Array.from(
    new Set([...existing.aliasHits, ...incoming.aliasHits]),
  );
  existing.categoryAdjustments = Array.from(
    new Set([...existing.categoryAdjustments, ...incoming.categoryAdjustments]),
  );
  existing.repeatCount += incoming.repeatCount;

  if (
    !explanationOverride && winner === "existing" && loserHasRicherExplanation
  ) {
    explanationOverride = combineExplanations(
      existing.explanation,
      loserSource.explanation,
    );
  }

  if (explanationOverride) {
    existing.explanation = explanationOverride;
  }

  // If the loser had a richer explanation, append a brief note for context in meta later.
  if (
    loserHasRicherExplanation &&
    !existing.categoryAdjustments.includes("merged_longer_explanation")
  ) {
    existing.categoryAdjustments.push("merged_longer_explanation");
  }
}

function dedupeCandidates(
  candidates: NormalizedCandidate[],
): NormalizedCandidate[] {
  const result: NormalizedCandidate[] = [];

  for (const candidate of candidates) {
    let merged = false;
    for (const existing of result) {
      if (shouldMerge(existing, candidate)) {
        mergeCandidates(existing, candidate);
        merged = true;
        break;
      }
    }
    if (!merged) {
      result.push(candidate);
    }
  }

  return result;
}

function finalizeCandidate(
  candidate: NormalizedCandidate,
  context: MistakeNormalizationContext,
): NormalizedMistakeItem {
  const categoryRecord = context.categoriesByCode.get(candidate.categoryCode);
  if (!categoryRecord) {
    throw new MistakeValidationError(
      `Category ${candidate.categoryCode} is not available in database.`,
    );
  }

  const desiredCategoryId = categoryRecord.id;
  const matchingFeatureTags: CanonicalFeatureTag[] = [];
  const mismatchingFeatureTags: CanonicalFeatureTag[] = [];

  for (const tag of candidate.featureTags) {
    const tagRecord = context.tagsByCode.get(tag);
    if (tagRecord && tagRecord.category_id === desiredCategoryId) {
      matchingFeatureTags.push(tag);
    } else {
      mismatchingFeatureTags.push(tag);
    }
  }

  const promotedFromExtra: CanonicalFeatureTag[] = [];
  const hadNoInitialMatches = matchingFeatureTags.length === 0;
  if (matchingFeatureTags.length < 2) {
    for (const tag of candidate.extraFeatureTags) {
      const tagRecord = context.tagsByCode.get(tag);
      if (
        tagRecord && tagRecord.category_id === desiredCategoryId &&
        !matchingFeatureTags.includes(tag)
      ) {
        matchingFeatureTags.push(tag);
        promotedFromExtra.push(tag);
      }
      if (matchingFeatureTags.length >= 2) {
        break;
      }
    }
  }

  const promotedSet = new Set(promotedFromExtra);
  let featureTags = matchingFeatureTags.slice(0, 2);

  const collectExtra: CanonicalFeatureTag[] = [];
  const pushUnique = (tags: CanonicalFeatureTag[]) => {
    for (const tag of tags) {
      if (!collectExtra.includes(tag)) {
        collectExtra.push(tag);
      }
    }
  };

  pushUnique(matchingFeatureTags.slice(2));
  pushUnique(mismatchingFeatureTags);
  pushUnique(candidate.extraFeatureTags.filter((tag) => !promotedSet.has(tag)));

  const extraFeatureTags = collectExtra;

  const primaryCandidate = featureTags.find((tag) => {
    const record = context.tagsByCode.get(tag);
    return record ? record.category_id === desiredCategoryId : false;
  }) ?? null;

  if (primaryCandidate) {
    const primaryIndex = featureTags.indexOf(primaryCandidate);
    if (primaryIndex > 0) {
      featureTags = [
        primaryCandidate,
        ...featureTags.slice(0, primaryIndex),
        ...featureTags.slice(primaryIndex + 1),
      ];
    }
  }

  const primaryTagCode: CanonicalFeatureTag | null = primaryCandidate;
  let primaryTagId: number | null = null;

  if (primaryTagCode) {
    const tagRecord = context.tagsByCode.get(primaryTagCode);
    if (!tagRecord) {
      throw new MistakeValidationError(
        `Feature tag ${primaryTagCode} is not available in database.`,
      );
    }
    if (tagRecord.category_id !== desiredCategoryId) {
      throw new MistakeValidationError(
        `Feature tag ${primaryTagCode} does not belong to category ${candidate.categoryCode}.`,
      );
    }
    primaryTagId = tagRecord.id;
  }

  const normalizationNotes = [...candidate.categoryAdjustments];
  if (candidate.anchorAdjustment) {
    normalizationNotes.push(
      `anchor_text_adjusted:${candidate.anchorAdjustment.strategy}`,
    );
  }
  if (
    candidate.featureTags[0] && candidate.featureTags[0] !== featureTags[0] &&
    featureTags[0]
  ) {
    normalizationNotes.push(`primary_promoted:${featureTags[0]}`);
  }
  if (hadNoInitialMatches && promotedFromExtra.length > 0) {
    normalizationNotes.push("primary_promoted_from_extra");
  }
  if (mismatchingFeatureTags.length > 0) {
    for (const tag of mismatchingFeatureTags) {
      normalizationNotes.push(`mismatched_feature_tag_omitted:${tag}`);
    }
  }

  const meta: Record<string, unknown> = {};
  if (featureTags.length > 0) {
    meta.feature_tags = featureTags;
  }
  if (extraFeatureTags.length > 0) {
    meta.truncated_feature_tags = extraFeatureTags;
  }
  if (candidate.aliasHits.length > 0) {
    meta.alias_hits = candidate.aliasHits;
  }
  if (candidate.anchorAdjustment) {
    meta.anchor_text_adjustment = candidate.anchorAdjustment;
  }
  if (normalizationNotes.length > 0) {
    meta.normalization_notes = Array.from(new Set(normalizationNotes));
  }
  if (candidate.suggestedTag) {
    meta.suggested_tag = candidate.suggestedTag;
  }
  if (candidate.repeatCount > 1) {
    meta.repeat_count = candidate.repeatCount;
  }

  return {
    categoryCode: candidate.categoryCode,
    categoryId: categoryRecord.id,
    featureTags,
    primaryTagCode,
    primaryTagId,
    anchorText: candidate.anchorText,
    anchorStart: candidate.anchorStart,
    anchorEnd: candidate.anchorEnd,
    suggestedCorrection: candidate.suggestedCorrection,
    explanation: candidate.explanation,
    suggestedTag: candidate.suggestedTag,
    meta,
  };
}

function computeSummary(items: NormalizedMistakeItem[]) {
  const byCategory: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const item of items) {
    byCategory[item.categoryCode] = (byCategory[item.categoryCode] ?? 0) + 1;
    for (const tag of item.featureTags) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }

  return { byCategory, byTag };
}

export function normalizeMistakesPayload(
  payload: unknown,
  context: MistakeNormalizationContext,
): NormalizedMistakesResult {
  if (!payload || typeof payload !== "object") {
    throw new MistakeValidationError("Mistakes payload must be an object.");
  }

  const source = payload as AiMistakesPayload;

  const rawItems = source.items ?? [];
  if (!Array.isArray(rawItems)) {
    throw new MistakeValidationError("mistakes.items must be an array.");
  }

  const candidates = rawItems.map((item) =>
    normalizeMistakeCandidate(item, context.submissionText)
  );
  const deduped = dedupeCandidates(candidates);
  const normalizedItems = deduped.map((item) =>
    finalizeCandidate(item, context)
  );
  const summary = computeSummary(normalizedItems);

  return { items: normalizedItems, summary };
}
