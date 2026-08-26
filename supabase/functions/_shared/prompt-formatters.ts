import type { KeywordCue, KeywordCuePlanEntry } from "./keyword-cue-types.ts";
import { assertKeywordCueIntegrity } from "./keyword-cue-plan.ts";

export function formatBulletList(
  items: readonly string[] | null | undefined,
  emptyMessage = "- None specified.",
): string {
  if (!items || items.length === 0) {
    return emptyMessage;
  }
  return items.map((item) => `- ${item}`).join("\n");
}

export function buildTeacherThemeSection(
  value: string | null | undefined,
): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  return [
    "=== Theme ===",
    "If provided, use this theme exclusively; override any rotating banks (topics, keyword cues, inspiration prompts) that conflict with it.",
    trimmed,
  ].join("\n");
}

export function buildTeacherSkillFocusSection(
  value: string | null | undefined,
): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  return [
    "=== Skill Focus (Hidden) ===",
    "Teacher focus overrides rotation, cue banks, and inspiration lists. Use it to shape every item implicitly.",
    "Ground scenarios in the clean-room layout contract and Teacher Theme before considering optional topic ideas.",
    `- Target focus: ${trimmed}`,
  ].join("\n");
}

export function buildTeacherSkillFocusFallbackSection(
  value: string | null | undefined,
): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  return [
    "=== Skill Focus Override ===",
    "Teacher provided this focus and it must drive all items even without a cue-bank mapping.",
    "Use the clean-room layout constraints and Teacher Theme to shape tone and structure, then adapt operators so the focus is realised.",
    "Ignore rotating cue banks or inspiration lists whenever they conflict with this focus; keep the product contract intact.",
    `- Target focus: ${trimmed}`,
  ].join("\n");
}

const TEACHER_THEME_PRESENT_NOTE =
  "Teacher Theme provided. Ground the entire scenario in this guidance; override rotating banks (topic lists, keyword cues, inspiration prompts) whenever they conflict.";
const TEACHER_THEME_ABSENT_NOTE =
  "No Teacher Theme provided. Start from the clean-room layout constraints, then consult neutral topic and skill banks only if you need additional angles.";

export function buildTeacherThemeGatingNote(hasTheme: boolean): string {
  return hasTheme ? TEACHER_THEME_PRESENT_NOTE : TEACHER_THEME_ABSENT_NOTE;
}

export function buildTeacherSkillFocusGatingNote(
  hasSkillFocus: boolean,
  options?: { fallbackApplied?: boolean },
): string {
  if (!hasSkillFocus) return "";
  if (options?.fallbackApplied) {
    return [
      "Skill Focus provided with no cue-bank mapping (override). Prioritise it above rotation guidance or cue previews; craft every transformation around this focus.",
      "Use the teacher theme and clean-room layout as the primary planning inputs; consult cue banks only if they reinforce the focus.",
    ].join("\n");
  }
  return [
    "Skill Focus provided. Prioritise item/content design to reflect it consistently across the entire set; override general rotation/diversity guidance when necessary. Never reveal the focus to learners.",
    "Treat this Skill Focus as a binding constraint; apply diversity only within that focus and never dilute it.",
  ].join("\n");
}

const TOPIC_BANK_DEFAULT_HEADING = "=== Optional Topic Bank ===";
const TOPIC_BANK_INSPIRATION_LINE =
  "Use these neutral scenarios as optional inspiration; create the final material from a blank page.";

export interface TopicBankSectionOptions {
  heading?: string;
  bullets?: string | readonly string[];
  hasTheme: boolean;
  includeInspirationLine?: boolean;
  inspirationLine?: string;
}

export function buildTopicBankSection(
  heading: string | undefined,
  topicList: string | readonly string[] | undefined,
  hasTheme: boolean,
): string;
export function buildTopicBankSection(options: TopicBankSectionOptions): string;
export function buildTopicBankSection(
  headingOrOptions: string | TopicBankSectionOptions | undefined,
  topicList?: string | readonly string[],
  hasThemeParam?: boolean,
): string {
  const options: TopicBankSectionOptions =
    typeof headingOrOptions === "object" && headingOrOptions !== null
      ? headingOrOptions
      : {
        heading: typeof headingOrOptions === "string"
          ? headingOrOptions
          : undefined,
        bullets: topicList,
        hasTheme: Boolean(hasThemeParam),
        includeInspirationLine: true,
      };

  if (options.hasTheme) return "";

  const heading = options.heading ?? TOPIC_BANK_DEFAULT_HEADING;
  const includeInspiration = options.includeInspirationLine ?? true;
  const bulletsSource = options.bullets;
  const customInspiration = typeof options.inspirationLine === "string"
    ? options.inspirationLine.trim()
    : "";
  let bulletContent = "";
  if (Array.isArray(bulletsSource)) {
    bulletContent = formatBulletList(bulletsSource, "");
  } else if (typeof bulletsSource === "string") {
    bulletContent = bulletsSource;
  }

  const trimmedBulletContent = bulletContent.trim();
  const lines: string[] = [heading];
  const hasTopics = trimmedBulletContent.length > 0;

  if (includeInspiration) {
    lines.push(
      customInspiration.length > 0
        ? customInspiration
        : TOPIC_BANK_INSPIRATION_LINE,
    );
  }

  if (hasTopics) {
    lines.push(trimmedBulletContent);
  } else {
    lines.push(
      "- No rotating topics available for this request. Derive a fresh angle from the clean-room constraints.",
    );
  }
  return lines.join("\n");
}

export interface RecentTopicsReminderOptions {
  hasTheme: boolean;
  prefix?: string;
}

export function buildRecentTopicsReminder(
  hint: string | null | undefined,
  options: RecentTopicsReminderOptions,
): string {
  if (options.hasTheme) return "";
  const trimmedHint = typeof hint === "string" ? hint.trim() : "";
  if (trimmedHint.length === 0) return "";
  const prefix =
    typeof options.prefix === "string" && options.prefix.trim().length > 0
      ? options.prefix.trim()
      : "- Consider a different angle than these recent topics.";
  return `${prefix} ${trimmedHint}`.trim();
}

export interface StringifyExamplesOptions {
  maxExamples?: number;
}

export interface ExampleSelectionOptions extends StringifyExamplesOptions {
  seed?: string | number;
  offset?: number;
}

function normaliseIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) return 0;
  const wrapped = index % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}

function computeSeededOffset(
  length: number,
  options?: Pick<ExampleSelectionOptions, "seed" | "offset">,
): number {
  if (length <= 0) return 0;
  if (options?.offset !== undefined && Number.isFinite(options.offset)) {
    return normaliseIndex(Math.trunc(options.offset), length);
  }
  if (options?.seed === undefined || options.seed === null) {
    return 0;
  }
  const seedString = String(options.seed);
  let hash = 0;
  for (let i = 0; i < seedString.length; i += 1) {
    hash = (hash * 31 + seedString.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

export function selectExamplesForDisplay<T>(
  examples: readonly T[] | null | undefined,
  options?: ExampleSelectionOptions,
): T[] {
  if (!examples || examples.length === 0) return [];

  const total = examples.length;
  const limit = options?.maxExamples && options.maxExamples > 0
    ? Math.min(Math.trunc(options.maxExamples), total)
    : total;

  const offset = computeSeededOffset(total, options);
  const sliceLength = limit > 0 ? limit : total;
  if (sliceLength === total && offset === 0) {
    return examples.slice();
  }

  const rotated: T[] = [];
  for (let i = 0; i < sliceLength; i += 1) {
    rotated.push(examples[(offset + i) % total]);
  }
  return rotated;
}

export function stringifyExamples<T>(
  examples: readonly T[] | null | undefined,
  options?: ExampleSelectionOptions,
): string {
  if (!examples || examples.length === 0) {
    return "[]";
  }
  const selected = selectExamplesForDisplay(examples, options);
  return JSON.stringify(selected, null, 2);
}

export function buildConstraintPlan(
  constraints: readonly string[] | null | undefined,
  questionCount: number,
  options?: ExampleSelectionOptions,
): string {
  if (!constraints || constraints.length === 0) {
    return "";
  }
  const normalizedCount = Math.trunc(questionCount);
  if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
    return "";
  }
  const rotated = selectExamplesForDisplay(constraints, {
    ...options,
    maxExamples: constraints.length,
  });
  const working = rotated.length > 0 ? rotated : Array.from(constraints);
  const baseLength = working.length;
  if (baseLength === 0) {
    return "";
  }
  const lines: string[] = [];
  for (let i = 0; i < normalizedCount; i += 1) {
    const cue = working[i % baseLength];
    lines.push(`- Q${i + 1}: ${cue}`);
  }
  return lines.join("\n");
}

export interface SummarizeExamplesOptions extends ExampleSelectionOptions {
  maxSummaries?: number;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function summarizeExamples(
  examples: readonly unknown[] | null | undefined,
  options?: SummarizeExamplesOptions,
): string {
  if (!examples || examples.length === 0) {
    return "- No source examples supplied; create from a blank page.";
  }

  const maxSummaries = options?.maxSummaries && options.maxSummaries > 0
    ? Math.trunc(options.maxSummaries)
    : 3;
  const selected = selectExamplesForDisplay(examples, {
    maxExamples: maxSummaries,
    seed: options?.seed,
    offset: options?.offset,
  });
  const summaries = selected.map((example, index) => {
    const record = isPlainRecord(example) ? example : {};
    const metadata = isPlainRecord(record.metadata) ? record.metadata : null;
    const collection = typeof metadata?.exam === "string"
      ? metadata.exam
      : "Unknown collection";
    const activity = typeof metadata?.partCode === "string"
      ? metadata.partCode
      : "Unknown activity";
    const topic = typeof metadata?.topic === "string"
      ? metadata.topic
      : undefined;
    const title = typeof record?.title === "string" ? record.title : undefined;
    const length = typeof record?.mainTextWithPlaceholders === "string"
      ? record.mainTextWithPlaceholders.split(/\s+/).filter(Boolean).length
      : undefined;
    const metaBits = [
      `Collection: ${collection}`,
      `Activity: ${activity}`,
      length ? `~${length} words` : undefined,
    ].filter(Boolean);
    const labelParts = [
      `Example ${index + 1}: ${title ?? "Untitled"}`,
      metaBits.length ? `(${metaBits.join(" · ")})` : undefined,
      topic ? `Topic: ${topic}` : undefined,
    ].filter(Boolean);
    return `- ${labelParts.join(" ")}`;
  });

  const remaining = examples.length > selected.length
    ? `- … ${examples.length - selected.length} additional examples available.`
    : undefined;
  return remaining
    ? [...summaries, remaining].join("\n")
    : summaries.join("\n");
}

export interface KeywordCueBankSectionOptions {
  heading?: string;
  cues: readonly KeywordCue[];
  hasTheme: boolean;
  inspirationLine?: string;
  maxVisible?: number;
}

function normaliseFrameForDisplay(frame: string): string {
  return frame.includes("_______")
    ? frame
    : frame.replace(/\s+{{gap}}\s+/gi, " _______ ");
}

export function buildKeywordCueBankSection(
  options: KeywordCueBankSectionOptions,
): string {
  const {
    cues,
    hasTheme,
    heading = "=== Keyword Cue Bank (rotate; prefer diverse keywords) ===",
    inspirationLine =
      "Rotate these level-specific cues to keep keyword/operator coverage diverse. Do not echo them verbatim; use them to plan transformations.",
  } = options;

  if (hasTheme) {
    // Teacher Theme must take precedence; hide the cue bank entirely so the model cannot see internal rotation scaffolding.
    return "";
  }

  const maxVisible =
    Number.isFinite(options.maxVisible) && options.maxVisible !== undefined
      ? Math.max(1, Math.trunc(options.maxVisible))
      : 8;

  const visibleCues = Array.isArray(cues) ? cues.slice(0, maxVisible) : [];
  if (visibleCues.length === 0) {
    return [
      heading,
      inspirationLine,
      "- Keyword cue bank unavailable; investigate data sourcing before generating new items.",
    ].join("\n");
  }

  const lines: string[] = [
    heading,
    inspirationLine,
  ];
  for (const cue of visibleCues) {
    assertKeywordCueIntegrity(cue);
    const frameSample = cue.frames.length > 0
      ? normaliseFrameForDisplay(cue.frames[0])
      : "_______";
    const variantList = cue.variants.map((variant: string) => variant.trim())
      .join(" · ");
    const pieces = [
      `KEYWORD=${cue.keyword}`,
      `operator=${cue.operator}`,
      `frame="${frameSample}"`,
      `variants=${variantList}`,
    ];
    if (cue.notes && cue.notes.trim().length > 0) {
      pieces.push(`notes=${cue.notes.trim()}`);
    }
    lines.push(`- ${pieces.join(" | ")}`);
  }
  if (cues.length > visibleCues.length) {
    lines.push(
      `- … ${
        cues.length - visibleCues.length
      } additional cues in rotation for this level.`,
    );
  }
  return lines.join("\n");
}

export function buildKeywordDevicePlan(
  plan: readonly KeywordCuePlanEntry[],
): string {
  if (!plan || plan.length === 0) {
    return "";
  }
  const lines: string[] = [];
  plan.forEach((entry, index) => {
    const label = `Q${index + 1}`;
    const variantList = entry.variants.map((variant: string) => variant.trim())
      .join(" · ");
    const parts = [
      `${label}: KEYWORD=${entry.keyword}`,
      `operator=${entry.operator}`,
      `frame="${entry.frame}"`,
      `variants=${variantList}`,
    ];
    if (entry.skillFocusTag) {
      parts.push(`skill-focus=${entry.skillFocusTag}`);
    }
    if (entry.notes && entry.notes.trim().length > 0) {
      parts.push(`notes=${entry.notes.trim()}`);
    }
    lines.push(`- ${parts.join(" | ")}`);
  });
  return lines.join("\n");
}

export function describeSkillFocusBias(
  skillFocusTag: string | undefined,
  options?: { fallbackApplied?: boolean; matchedCount?: number },
): string {
  if (!skillFocusTag) {
    return "";
  }
  if (options?.fallbackApplied) {
    const matched = typeof options.matchedCount === "number"
      ? options.matchedCount
      : 0;
    return `Skill Focus "${skillFocusTag}" requested. Cue bank lacks a dedicated mapping, so treat the teacher focus as the primary brief and adapt keywords/operators accordingly (matched cues: ${matched}).`;
  }
  return `Skill Focus "${skillFocusTag}" applied across cue selection. Remove unnecessary scaffolding and ensure every transformation realises this focus implicitly.`;
}
