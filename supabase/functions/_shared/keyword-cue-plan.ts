import type {
  KeywordCue,
  KeywordCueLevel,
  KeywordCuePlanEntry,
  KeywordCuePlanResult,
} from "./keyword-cue-types.ts";
import { keywordCueSkillFocusMap } from "./keyword-cue-skill-focus.ts";

const WORD_WINDOWS: Record<
  KeywordCueLevel,
  { readonly minWords: number; readonly maxWords: number }
> = {
  B2: { minWords: 2, maxWords: 5 },
  C1: { minWords: 3, maxWords: 6 },
  C2: { minWords: 3, maxWords: 8 },
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getWordWindow(
  level: KeywordCueLevel,
): { minWords: number; maxWords: number } {
  return WORD_WINDOWS[level] ?? WORD_WINDOWS.C1;
}

function expandContractions(answer: string): string {
  let result = answer.replace(/[\u2018\u2019]/g, "'");
  const replacements: Array<
    [RegExp, (substring: string, ...groups: string[]) => string]
  > = [
    [/\blet's\b/gi, () => "let us"],
    [/\b(can|shan|won)'t\b/gi, (_match, prefix) => `${prefix} not`],
    [/\b(\w+)n't\b/gi, (_match, prefix) => {
      const base = prefix.toLowerCase().endsWith("n")
        ? prefix.slice(0, -1)
        : prefix;
      return `${base} not`;
    }],
    [/\b(\w+)'re\b/gi, (_match, prefix) => `${prefix} are`],
    [/\b(\w+)'ve\b/gi, (_match, prefix) => `${prefix} have`],
    [/\b(\w+)'ll\b/gi, (_match, prefix) => `${prefix} will`],
    [/\b(\w+)'d\b/gi, (_match, prefix) => `${prefix} would`],
    [/\b(\w+)'m\b/gi, (_match, prefix) => `${prefix} am`],
    [/\b(\w+)'s\b/gi, (_match, prefix) => `${prefix} is`],
  ];
  for (const [pattern, replacer] of replacements) {
    result = result.replace(
      pattern,
      (substring, ...groups) => replacer(substring, ...groups),
    );
  }
  return result;
}

export function computeAnswerWordCount(answer: string): number {
  const expanded = expandContractions(answer);
  const sanitized = expanded
    .replace(/[“”"‘’.,!?;:()]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/'/g, " ");
  const tokens = sanitized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.length;
}

function tokenizeForComparison(value: string): readonly string[] {
  return value
    .replace(/_/g, " ")
    .replace(/[\u2018\u2019\uFF07]/g, "'")
    .split(/[^A-Za-z']+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function findSuffixPrefixOverlap(
  leftTokens: readonly string[],
  variantTokens: readonly string[],
): number {
  const max = Math.min(leftTokens.length, variantTokens.length);
  for (let size = max; size > 0; size -= 1) {
    let matches = true;
    for (let index = 0; index < size; index += 1) {
      if (
        leftTokens[leftTokens.length - size + index] !== variantTokens[index]
      ) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return size;
    }
  }
  return 0;
}

function findPrefixSuffixOverlap(
  rightTokens: readonly string[],
  variantTokens: readonly string[],
): number {
  const max = Math.min(rightTokens.length, variantTokens.length);
  for (let size = max; size > 0; size -= 1) {
    let matches = true;
    for (let index = 0; index < size; index += 1) {
      if (
        rightTokens[index] !==
          variantTokens[variantTokens.length - size + index]
      ) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return size;
    }
  }
  return 0;
}

function findInternalOverlap(
  boundaryTokens: readonly string[],
  variantTokens: readonly string[],
  options: { direction: "prefix" | "suffix"; minSize?: number },
): number {
  const { direction, minSize = 2 } = options;
  if (!boundaryTokens.length || !variantTokens.length) return 0;
  const limit = Math.min(boundaryTokens.length, variantTokens.length);
  if (limit < minSize) return 0;

  for (let size = limit; size >= minSize; size -= 1) {
    const target = direction === "prefix"
      ? boundaryTokens.slice(0, size)
      : boundaryTokens.slice(boundaryTokens.length - size);
    if (target.length !== size) {
      continue;
    }
    const maxStart = variantTokens.length - size;
    for (let start = 0; start <= maxStart; start += 1) {
      if (direction === "prefix" && start === maxStart) {
        continue;
      }
      if (direction === "suffix" && start === 0) {
        continue;
      }
      let matches = true;
      for (let index = 0; index < size; index += 1) {
        if (variantTokens[start + index] !== target[index]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return size;
      }
    }
  }
  return 0;
}

function normalizeKeyword(keyword: string): string {
  return keyword
    .trim()
    .replace(/[\u2018\u2019\uFF07]/g, "'")
    .toUpperCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertKeywordCueIntegrity(cue: KeywordCue): void {
  const keyword = normalizeKeyword(cue.keyword);
  ensure(
    /^[A-Z](?:[A-Z']*[A-Z])?$/.test(keyword),
    `keyword "${cue.keyword}" must be a single uppercase token (letters and apostrophes allowed)`,
  );

  ensure(
    Array.isArray(cue.frames) && cue.frames.length > 0,
    `keyword "${keyword}" must provide at least one frame`,
  );
  const frameKeywordPattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
  const frameContexts = cue.frames.map((frame) => {
    ensure(
      typeof frame === "string" && frame.includes("_______"),
      `frame for "${keyword}" must include the placeholder _______`,
    );
    ensure(
      !frameKeywordPattern.test(frame),
      `frame for "${keyword}" must not repeat the keyword outside the placeholder`,
    );
    const [beforeRaw = "", ...rest] = frame.split("_______");
    const afterRaw = rest.length > 0 ? rest.join("_______") : "";
    return {
      frame,
      beforeTokens: tokenizeForComparison(beforeRaw),
      afterTokens: tokenizeForComparison(afterRaw),
    };
  });

  ensure(
    Array.isArray(cue.variants) && cue.variants.length > 0,
    `keyword "${keyword}" must provide variants`,
  );
  const window = WORD_WINDOWS[cue.level];
  const keywordPattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
  for (const variant of cue.variants) {
    ensure(
      keywordPattern.test(variant),
      `variant "${variant}" must include the keyword "${keyword}"`,
    );
    const wordCount = computeAnswerWordCount(variant);
    ensure(
      wordCount >= window.minWords && wordCount <= window.maxWords,
      `variant "${variant}" for "${keyword}" must be within ${window.minWords}–${window.maxWords} words`,
    );
    const variantTokens = tokenizeForComparison(variant);
    for (const { frame, beforeTokens, afterTokens } of frameContexts) {
      const leftOverlap = findSuffixPrefixOverlap(beforeTokens, variantTokens);
      ensure(
        leftOverlap === 0,
        `frame "${frame}" for "${keyword}" must not repeat the first ${leftOverlap} token(s) from variant "${variant}"`,
      );
      const rightOverlap = findPrefixSuffixOverlap(afterTokens, variantTokens);
      ensure(
        rightOverlap === 0,
        `frame "${frame}" for "${keyword}" must not repeat the last ${rightOverlap} token(s) from variant "${variant}"`,
      );
      const internalLeft = findInternalOverlap(beforeTokens, variantTokens, {
        direction: "suffix",
      });
      ensure(
        internalLeft === 0,
        `frame "${frame}" for "${keyword}" duplicates the last ${internalLeft} token(s) from variant "${variant}" before the gap`,
      );
      const internalRight = findInternalOverlap(afterTokens, variantTokens, {
        direction: "prefix",
      });
      ensure(
        internalRight === 0,
        `frame "${frame}" for "${keyword}" duplicates the first ${internalRight} token(s) from variant "${variant}" after the gap`,
      );
    }
  }
}

export interface SelectKeywordCuePlanOptions {
  readonly cues: readonly KeywordCue[];
  readonly questionCount: number;
  readonly seed?: string | number;
  readonly skillFocusTag?: string | null;
  readonly filterStats?: {
    readonly filteredCount: number;
    readonly totalAvailable: number;
  };
}

function chooseFrame(cue: KeywordCue, seed: string, index: number): string {
  if (!cue.frames.length) {
    return "_______";
  }
  if (cue.frames.length === 1) {
    return cue.frames[0];
  }
  const compositeSeed = `${seed}#${cue.id}#${index}`;
  const position = hashString(compositeSeed) % cue.frames.length;
  return cue.frames[position];
}

function deterministicOrder(
  cues: readonly KeywordCue[],
  seed: string,
): readonly KeywordCue[] {
  return cues
    .map((cue) => {
      const composite = `${seed}#${cue.id}#${cue.keyword}`;
      return { cue, score: hashString(composite) };
    })
    .sort((a, b) => {
      if (a.score === b.score) {
        return a.cue.id.localeCompare(b.cue.id);
      }
      return a.score - b.score;
    })
    .map((entry) => entry.cue);
}

function normalizeSkillFocusTag(
  input: string | null | undefined,
): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
    /^-+|-+$/g,
    "",
  );
  return normalized.length > 0 ? normalized : undefined;
}

export interface ApplySkillFocusCueFilterResult {
  readonly cues: readonly KeywordCue[];
  /** Normalised tag actually enforced after filtering (undefined when falling back). */
  readonly appliedTag?: string;
  /** Normalised tag originally requested by the caller, even if we fall back. */
  readonly requestedTag?: string;
  /** Count of cues that matched the tag-specific filter before any fallback. */
  readonly matchedCount: number;
  /** True when the requested skill focus did not have enough cues and we returned the full bank. */
  readonly fallbackApplied: boolean;
}

export function applySkillFocusCueFilter(
  skillFocus: string | null | undefined,
  baseCues: readonly KeywordCue[],
  questionCount: number,
): ApplySkillFocusCueFilterResult {
  const normalizedTag = normalizeSkillFocusTag(skillFocus);
  if (!normalizedTag) {
    return {
      cues: baseCues,
      appliedTag: undefined,
      requestedTag: undefined,
      matchedCount: baseCues.length,
      fallbackApplied: false,
    };
  }

  const mapping = keywordCueSkillFocusMap[normalizedTag];
  if (!mapping) {
    console.warn(
      "keyword cue skill focus fallback triggered: no mapping found; reverting to full bank.",
    );
    return {
      cues: baseCues,
      appliedTag: undefined,
      requestedTag: normalizedTag,
      matchedCount: 0,
      fallbackApplied: true,
    };
  }

  const allowCueIds = new Set(mapping.cueIds ?? []);
  const allowOperators = new Set(
    (mapping.operators ?? []).map((op) => op.toLowerCase()),
  );
  const allowLevels = new Set(mapping.levels ?? []);
  const filtered = baseCues.filter((cue) => {
    if (allowLevels.size > 0 && !allowLevels.has(cue.level)) {
      return false;
    }
    const matchesCueId = allowCueIds.size > 0 && allowCueIds.has(cue.id);
    const matchesOperator = allowOperators.size > 0 &&
      allowOperators.has(cue.operator.toLowerCase());

    if (allowCueIds.size > 0 && allowOperators.size === 0) {
      return matchesCueId;
    }

    if (allowCueIds.size === 0 && allowOperators.size === 0) {
      return true;
    }

    return matchesCueId || matchesOperator;
  });

  if (filtered.length === 0) {
    console.warn(
      "keyword cue skill focus fallback triggered: no cues available; reverting to full bank.",
    );
    return {
      cues: baseCues,
      appliedTag: undefined,
      requestedTag: normalizedTag,
      matchedCount: 0,
      fallbackApplied: true,
    };
  }

  if (filtered.length < questionCount) {
    console.warn("keyword cue skill focus has partial coverage.", {
      available_count: filtered.length,
      requested_count: questionCount,
    });
  }

  return {
    cues: filtered,
    appliedTag: normalizedTag,
    requestedTag: normalizedTag,
    matchedCount: filtered.length,
    fallbackApplied: false,
  };
}

export function selectKeywordCuePlan(
  options: SelectKeywordCuePlanOptions,
): KeywordCuePlanResult {
  const { cues, questionCount, seed: seedInput, skillFocusTag, filterStats } =
    options;
  const availableCues = Array.isArray(cues) ? cues : [];
  const filteredCount = filterStats?.filteredCount ?? availableCues.length;
  const totalAvailable = filterStats?.totalAvailable ?? availableCues.length;
  const normalizedSkillFocusTag = skillFocusTag
    ? normalizeSkillFocusTag(skillFocusTag)
    : undefined;

  if (
    !Array.isArray(cues) || cues.length === 0 ||
    !Number.isFinite(questionCount) || questionCount <= 0
  ) {
    return {
      entries: [],
      sourceCues: [],
      metadata: {
        appliedSkillFocusTag: normalizedSkillFocusTag,
        fallbackToFullBank: false,
        filteredCount,
        totalAvailable,
      },
    };
  }

  const trimmedSeed = seedInput === undefined || seedInput === null
    ? ""
    : String(seedInput);
  const seed = trimmedSeed.length > 0 ? trimmedSeed : "kwt-cue-plan";

  const ordered = deterministicOrder(cues, seed);
  const selected: KeywordCue[] = [];
  const usedCueIds = new Set<string>();
  let diversityFallback = false;
  let diversityFallbackLogged = false;
  const logDiversityFallback = (_reason: string) => {
    if (diversityFallbackLogged) return;
    console.warn("keyword cue plan diversity fallback triggered.", {
      requested_count: questionCount,
      available_count: cues.length,
    });
    diversityFallbackLogged = true;
  };
  let attempts = 0;

  while (selected.length < questionCount && attempts < cues.length * 3) {
    for (const cue of ordered) {
      if (selected.length >= questionCount) break;
      if (usedCueIds.has(cue.id)) continue;
      const previous = selected[selected.length - 1];
      if (
        previous &&
        (previous.keyword.toUpperCase() === cue.keyword.toUpperCase() ||
          previous.operator.toLowerCase() === cue.operator.toLowerCase())
      ) {
        continue;
      }
      selected.push(cue);
      usedCueIds.add(cue.id);
    }
    attempts += 1;
    if (selected.length < questionCount) {
      // allow reuse if diversity cannot be met; reset used set but keep already selected order.
      usedCueIds.clear();
      diversityFallback = true;
      logDiversityFallback("insufficient unique cues to avoid repeats");
    }
  }

  if (selected.length < questionCount) {
    // Fill the remainder even if operators/keywords repeat;
    // deterministic order ensures reproducibility.
    diversityFallback = true;
    logDiversityFallback("padding selection with deterministic order");
    for (const cue of ordered) {
      if (selected.length >= questionCount) break;
      selected.push(cue);
    }
  }

  const entries: KeywordCuePlanEntry[] = selected.slice(0, questionCount).map(
    (cue, index) => {
      assertKeywordCueIntegrity(cue);
      const frame = chooseFrame(cue, seed, index);
      ensure(
        typeof frame === "string" && frame.includes("_______"),
        `Selected frame for cue "${cue.id}" must include placeholder`,
      );
      return {
        cueId: cue.id,
        keyword: normalizeKeyword(cue.keyword),
        operator: cue.operator,
        frame,
        variants: cue.variants,
        notes: cue.notes,
        skillFocusTag: normalizedSkillFocusTag,
        level: cue.level,
      };
    },
  );

  return {
    entries,
    sourceCues: selected,
    metadata: {
      appliedSkillFocusTag: normalizedSkillFocusTag,
      fallbackToFullBank: diversityFallback,
      filteredCount,
      totalAvailable,
    },
  };
}
