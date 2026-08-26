import type { RuoELayoutKey } from "./ruoe-layout-map.ts";

/**
 * Original, provider-neutral practice layouts.
 *
 * Counts and constraints are product choices for Exameny's CEFR-aligned
 * activities. They do not claim to reproduce any examining organisation's
 * papers, labels, score scales, or proprietary specifications.
 */

export type RuoELevelCode = "B1" | "B2" | "C1" | "C2";

export interface RuoETaskPromptConfig {
  layout: RuoELayoutKey;
  questionCount: number;
  placeholderPrefix: string;
  optionLetters?: string[];
  sampleThemes?: readonly string[];
  sampleThemesByLevel: Partial<Record<RuoELevelCode, readonly string[]>>;
  topicBankHeading?: string;
  layoutGuidelines: string[];
  answerGuidelines: string[];
  additionalNotes?: string[];
  sectionLetters?: string[];
  sectionCountSummary?: string;
  sectionLengthTargets?: { minWords: number; maxWords: number };
  questionFocusGuidelines?: string[];
  coverageGuidelines?: string[];
  diversityGuidance?: string[];
  reusePolicyNote?: string;
}

const TOPIC_ANGLES = [
  "A practical decision about",
  "A small community project involving",
  "A learner comparing options for",
  "An unexpected problem connected with",
  "A reflective account of",
  "Different viewpoints on",
];

const LEVEL_DOMAINS: Record<RuoELevelCode, readonly string[]> = {
  B1: [
    "a neighbourhood book exchange",
    "planning a low-cost day trip",
    "sharing household responsibilities",
    "joining a local sports group",
    "learning a useful everyday skill",
    "choosing a safe cycling route",
    "organising a school club",
    "reducing food waste at home",
    "helping at a community garden",
    "using a library or study space",
  ],
  B2: [
    "redesigning a public study space",
    "balancing part-time work and study",
    "making local transport more accessible",
    "running a repair and reuse workshop",
    "choosing reliable online information",
    "welcoming newcomers to a community",
    "planning an inclusive cultural event",
    "improving wellbeing in a busy week",
    "testing a shared bicycle scheme",
    "organising peer mentoring",
  ],
  C1: [
    "the trade-offs of flexible working",
    "how cities measure successful public spaces",
    "responsible uses of learning technology",
    "the limits of individual environmental action",
    "how organisations retain practical knowledge",
    "public trust in scientific communication",
    "the role of arts in community resilience",
    "fair access to lifelong learning",
    "how teams make decisions under uncertainty",
    "balancing tourism and local needs",
  ],
  C2: [
    "institutional memory and organisational change",
    "the ethics of predictive decision systems",
    "how language shapes public disagreement",
    "the tension between efficiency and resilience",
    "cultural preservation in changing cities",
    "the value and limits of expert consensus",
    "measurement bias in public policy",
    "how incentives alter professional judgement",
    "the social consequences of convenience",
    "competing models of civic responsibility",
  ],
};

function buildTopicBank(level: RuoELevelCode): readonly string[] {
  return LEVEL_DOMAINS[level].flatMap((domain) =>
    TOPIC_ANGLES.map((angle) => `${angle} ${domain}`)
  );
}

const LEVEL_TOPIC_BANKS: Record<RuoELevelCode, readonly string[]> = {
  B1: buildTopicBank("B1"),
  B2: buildTopicBank("B2"),
  C1: buildTopicBank("C1"),
  C2: buildTopicBank("C2"),
};

const MATCHING_TOPIC_BANKS: Record<RuoELevelCode, readonly string[]> = {
  B1: LEVEL_DOMAINS.B1.flatMap((domain) => [
    `People with different needs choosing ${domain}`,
    `Short profiles describing experiences with ${domain}`,
    `Preferences and practical limits related to ${domain}`,
    `Advice from several speakers about ${domain}`,
    `Contrasting reasons for taking part in ${domain}`,
    `Outcomes reported by participants in ${domain}`,
  ]),
  B2: LEVEL_DOMAINS.B2.flatMap((domain) => [
    `Contrasting participant experiences of ${domain}`,
    `Motivations and reservations surrounding ${domain}`,
    `Practical constraints affecting ${domain}`,
    `Different lessons learned from ${domain}`,
    `Evidence-led recommendations about ${domain}`,
    `Attitudes towards the results of ${domain}`,
  ]),
  C1: LEVEL_DOMAINS.C1.flatMap((domain) => [
    `Specialist and public perspectives on ${domain}`,
    `Subtle disagreements concerning ${domain}`,
    `Competing criteria for evaluating ${domain}`,
    `Unintended consequences associated with ${domain}`,
    `Evidence and assumptions used to discuss ${domain}`,
    `Stakeholder priorities shaping ${domain}`,
  ]),
  C2: LEVEL_DOMAINS.C2.flatMap((domain) => [
    `Underlying principles in debates about ${domain}`,
    `Implicit assumptions behind positions on ${domain}`,
    `Methodological disputes concerning ${domain}`,
    `Historical analogies used to frame ${domain}`,
    `Conflicting ethical arguments about ${domain}`,
    `Long-term implications of choices about ${domain}`,
  ]),
};

const MC_CLOZE_COUNTS: Record<string, number> = {
  B1_LANG_MC_CLOZE: 6,
  B2_LANG_MC_CLOZE: 8,
  C1_LANG_MC_CLOZE: 8,
  C2_LANG_MC_CLOZE: 8,
};

const OPEN_CLOZE_COUNTS: Record<string, number> = {
  B1_LANG_OPEN_CLOZE: 6,
  B2_LANG_OPEN_CLOZE: 8,
  C1_LANG_OPEN_CLOZE: 8,
  C2_LANG_OPEN_CLOZE: 8,
};

const WORD_FORMATION_COUNTS: Record<string, number> = {
  B2_LANG_WORD_FORMATION: 8,
  C1_LANG_WORD_FORMATION: 8,
  C2_LANG_WORD_FORMATION: 8,
};

const TRANSFORMATION_COUNTS: Record<string, number> = {
  B2_LANG_TRANSFORMATION: 6,
  C1_LANG_TRANSFORMATION: 6,
  C2_LANG_TRANSFORMATION: 6,
};

const READING_MCQ_COUNTS: Record<
  string,
  { questions: number; options: string[] }
> = {
  B1_READ_MCQ_SHORT: { questions: 5, options: ["A", "B", "C"] },
  B1_READ_MCQ_LONG: { questions: 5, options: ["A", "B", "C", "D"] },
  B2_READ_MCQ: { questions: 6, options: ["A", "B", "C", "D"] },
  C1_READ_MCQ: { questions: 6, options: ["A", "B", "C", "D"] },
  C2_READ_MCQ: { questions: 6, options: ["A", "B", "C", "D"] },
};

const GAPPED_TEXT_COUNTS: Record<
  string,
  { questions: number; options: number; letters: string[] }
> = {
  B1_READ_GAPPED_TEXT: {
    questions: 5,
    options: 6,
    letters: ["A", "B", "C", "D", "E", "F"],
  },
  B2_READ_GAPPED_TEXT: {
    questions: 6,
    options: 7,
    letters: ["A", "B", "C", "D", "E", "F", "G"],
  },
  C1_READ_GAPPED_TEXT: {
    questions: 6,
    options: 7,
    letters: ["A", "B", "C", "D", "E", "F", "G"],
  },
  C2_READ_GAPPED_TEXT: {
    questions: 7,
    options: 8,
    letters: ["A", "B", "C", "D", "E", "F", "G", "H"],
  },
};

export const MULTIPLE_MATCHING_COUNTS: Record<
  string,
  {
    questions: number;
    minOptions: number;
    maxOptions: number;
    allowedLetters: string[];
    reuseAllowed: boolean;
    sectionLengthRange: { minWords: number; maxWords: number };
    sectionCountSummary: string;
    questionFocuses: string[];
    coverageGuidelines: string[];
    diversityGuidance: string[];
  }
> = {
  B1_READ_MULTIPLE_MATCHING: matchingCounts(5, 8, 8, 40, 85, "B1"),
  B2_READ_MULTIPLE_MATCHING: matchingCounts(10, 4, 4, 75, 120, "B2"),
  C1_READ_MULTIPLE_MATCHING: matchingCounts(10, 4, 5, 95, 170, "C1"),
  C2_READ_MULTIPLE_MATCHING: matchingCounts(10, 4, 6, 110, 190, "C2"),
};

function matchingCounts(
  questions: number,
  minOptions: number,
  maxOptions: number,
  minWords: number,
  maxWords: number,
  level: RuoELevelCode,
) {
  return {
    questions,
    minOptions,
    maxOptions,
    allowedLetters: Array.from(
      { length: maxOptions },
      (_, index) => String.fromCharCode(65 + index),
    ),
    reuseAllowed: true,
    sectionLengthRange: { minWords, maxWords },
    sectionCountSummary: `Create ${minOptions}${
      minOptions === maxOptions ? "" : `-${maxOptions}`
    } labelled sections of comparable depth.`,
    questionFocuses: [
      "stated motivation or goal",
      "practical constraint or reservation",
      "reported outcome or lesson",
      "attitude supported by a precise textual cue",
    ],
    coverageGuidelines: [
      `Keep language and inference load appropriate for ${level}.`,
      "Give every match a unique, explicit evidence anchor.",
    ],
    diversityGuidance: [
      "Vary setting, motivation, and tone without relying on stereotypes.",
      "Avoid lexical copying between a statement and its matching section.",
    ],
  };
}

export const CROSS_TEXT_BALANCE_REQUIREMENTS: readonly string[] = [
  "Create four original short texts with distinct but defensible positions.",
  "Balance agreement, partial agreement, and disagreement across the set.",
  "Anchor each answer in stance, reasoning, or evidence rather than keyword overlap.",
  "Do not name real people, organisations, publications, or proprietary material.",
];

export function getKeywordTransformationDevices(
  levelCode: string,
): readonly string[] {
  const level = normalizeLevel(levelCode);
  const byLevel: Record<RuoELevelCode, readonly string[]> = {
    B1: [
      "basic comparison",
      "simple modal",
      "present or past contrast",
      "common verb pattern",
    ],
    B2: [
      "passive shift",
      "conditional",
      "reported idea",
      "comparison",
      "phrasal verb",
    ],
    C1: [
      "inversion",
      "modal deduction",
      "causative structure",
      "participle clause",
      "emphasis",
    ],
    C2: [
      "nuanced modality",
      "ellipsis",
      "advanced inversion",
      "idiomatic equivalence",
      "nominalisation",
    ],
  };
  return byLevel[level];
}

export function getReadingMcqFocusRotation(
  levelCode: string,
): readonly string[] {
  const level = normalizeLevel(levelCode);
  const common = [
    "main purpose",
    "explicit supporting detail",
    "inference from context",
    "writer or speaker attitude",
    "meaning of a phrase in context",
    "relationship between two ideas",
  ];
  return level === "B1"
    ? common.slice(0, 5)
    : level === "C2"
    ? [...common, "unstated assumption", "rhetorical effect"]
    : common;
}

export function getMultipleMatchingConstraintRotation(
  levelCode: string,
): readonly string[] {
  const level = normalizeLevel(levelCode);
  return [
    `${level}: match a stated preference to direct evidence`,
    `${level}: match a practical limitation to its consequence`,
    `${level}: match a reported outcome to the relevant speaker`,
    `${level}: match attitude using tone rather than repeated vocabulary`,
    `${level}: match a comparison or contrast across sections`,
  ];
}

function commonConfig(
  layout: RuoELayoutKey,
  questionCount: number,
  placeholderPrefix = "GAP",
): Pick<
  RuoETaskPromptConfig,
  | "layout"
  | "questionCount"
  | "placeholderPrefix"
  | "sampleThemesByLevel"
  | "topicBankHeading"
> {
  return {
    layout,
    questionCount,
    placeholderPrefix,
    sampleThemesByLevel: LEVEL_TOPIC_BANKS,
    topicBankHeading: "Neutral topic ideas for optional rotation",
  };
}

export function getRuoETaskPromptConfig(
  taskCode: string,
): RuoETaskPromptConfig {
  const code = taskCode.toUpperCase();

  if (code in MC_CLOZE_COUNTS) {
    return {
      ...commonConfig("ruoe-mc-cloze", MC_CLOZE_COUNTS[code]),
      optionLetters: ["A", "B", "C", "D"],
      layoutGuidelines: [
        "Write one cohesive original passage with numbered placeholders in reading order.",
        "Make every gap depend on local meaning, grammar, or collocation.",
      ],
      answerGuidelines: [
        "Provide exactly four labelled options and exactly one correct option per question.",
        "Explain why each option fits or fails in this specific sentence.",
      ],
      additionalNotes: [
        "Do not repeat the same lexical target across adjacent gaps.",
      ],
      diversityGuidance: [
        "Rotate collocation, precision, cohesion, and register targets.",
      ],
    };
  }

  if (code in OPEN_CLOZE_COUNTS) {
    return {
      ...commonConfig("ruoe-open-cloze", OPEN_CLOZE_COUNTS[code]),
      layoutGuidelines: [
        "Write one cohesive original passage with one-word numbered gaps.",
        "Distribute targets across function words, grammar, and cohesion.",
      ],
      answerGuidelines: [
        "Provide every ordinary single-word answer that is valid in context.",
        "Avoid gaps with two equally natural answers unless both are accepted.",
      ],
      diversityGuidance: [
        "Vary the grammatical function tested by adjacent gaps.",
      ],
    };
  }

  if (code in WORD_FORMATION_COUNTS) {
    return {
      ...commonConfig("ruoe-word-formation", WORD_FORMATION_COUNTS[code]),
      layoutGuidelines: [
        "Write a cohesive passage with a root word supplied for every numbered gap.",
        "Require derivation that is justified by syntax and meaning.",
      ],
      answerGuidelines: [
        "Store the root in questionText and valid derived forms in correctAnswers.",
        "Explain relevant spelling or polarity changes in concise feedback.",
      ],
      diversityGuidance: ["Rotate word class, polarity, and affix patterns."],
    };
  }

  if (code in TRANSFORMATION_COUNTS) {
    return {
      ...commonConfig(
        "ruoe-keyword-transformation",
        TRANSFORMATION_COUNTS[code],
      ),
      layoutGuidelines: [
        "Create independent sentence pairs that express the same meaning.",
        "Include one uppercase key word and one continuous underscore gap.",
      ],
      answerGuidelines: [
        "Keep the key word unchanged in every accepted answer.",
        "Make each equivalence precise and explain the governing language pattern.",
      ],
      additionalNotes: [
        ...getKeywordTransformationDevices(inferLevelFromCode(code)),
      ],
      diversityGuidance: [
        "Use a different transformation family for each item.",
      ],
    };
  }

  if (code in READING_MCQ_COUNTS) {
    const settings = READING_MCQ_COUNTS[code];
    return {
      ...commonConfig("ruoe-reading-mcq", settings.questions, "Q"),
      optionLetters: settings.options,
      layoutGuidelines: [
        code === "B1_READ_MCQ_SHORT"
          ? "Create exactly five short notices labelled Notice 1 through Notice 5."
          : "Create one original, self-contained reading passage.",
        "Make questions follow the order of evidence where practical.",
      ],
      answerGuidelines: [
        `Provide exactly ${settings.options.length} options and one correct answer per question.`,
        "Give specific feedback tied to textual evidence.",
      ],
      questionFocusGuidelines: [
        ...getReadingMcqFocusRotation(inferLevelFromCode(code)),
      ],
      diversityGuidance: [
        "Rotate detail, inference, purpose, attitude, and contextual meaning.",
      ],
    };
  }

  if (code in GAPPED_TEXT_COUNTS) {
    const settings = GAPPED_TEXT_COUNTS[code];
    return {
      ...commonConfig("ruoe-gapped-text", settings.questions),
      optionLetters: settings.letters,
      layoutGuidelines: [
        `Create a coherent original text with ${settings.questions} numbered gaps.`,
        `Provide ${settings.options} labelled sentence or paragraph options, including one distractor.`,
      ],
      answerGuidelines: [
        "Each answer must be supported by reference, cohesion, or discourse logic on both sides of the gap.",
        "Mark exactly one option as the distractor.",
      ],
      diversityGuidance: [
        "Vary pronoun reference, lexical cohesion, sequence, and contrast cues.",
      ],
    };
  }

  if (code in MULTIPLE_MATCHING_COUNTS) {
    const settings = MULTIPLE_MATCHING_COUNTS[code];
    return {
      ...commonConfig("ruoe-multiple-matching", settings.questions, "Q"),
      sampleThemesByLevel: MATCHING_TOPIC_BANKS,
      sectionLetters: settings.allowedLetters,
      sectionCountSummary: settings.sectionCountSummary,
      sectionLengthTargets: settings.sectionLengthRange,
      questionFocusGuidelines: settings.questionFocuses,
      coverageGuidelines: settings.coverageGuidelines,
      diversityGuidance: settings.diversityGuidance,
      reusePolicyNote: settings.reuseAllowed
        ? "A section may answer more than one statement when each match has separate evidence."
        : "Use each section once.",
      layoutGuidelines: [
        settings.sectionCountSummary,
        "Label sections contiguously from A and keep them comparable in detail.",
      ],
      answerGuidelines: [
        "Write one concise statement per question and provide one section letter as the answer.",
        "Include an explanation naming the evidence without copying the statement wording.",
      ],
    };
  }

  if (code === "C1_READ_CROSS_TEXT") {
    return {
      ...commonConfig("ruoe-cross-text", 4, "Q"),
      sectionLetters: ["A", "B", "C", "D"],
      layoutGuidelines: [...CROSS_TEXT_BALANCE_REQUIREMENTS],
      answerGuidelines: [
        "Provide one text letter per question.",
        "Make each answer depend on a defensible comparison of viewpoints.",
      ],
      diversityGuidance: [
        "Vary claim, evidence, qualification, and rhetorical stance.",
      ],
    };
  }

  throw new Error(`Unsupported language-practice task code: ${taskCode}`);
}

export function getSampleThemesFor(
  taskCode: string,
  levelCode: string,
  count: number,
  seed = "exameny-clean-room",
): string[] {
  const config = getRuoETaskPromptConfig(taskCode);
  const level = normalizeLevel(levelCode);
  const bank = [
    ...(config.sampleThemesByLevel[level] ?? config.sampleThemes ?? []),
  ];
  if (bank.length === 0 || count <= 0) return [];

  const offset = stableHash(`${taskCode}:${level}:${seed}`) % bank.length;
  return Array.from(
    { length: Math.min(Math.floor(count), bank.length) },
    (_, index) => bank[(offset + index) % bank.length],
  );
}

export function getLevelGuidance(levelCode: string): string {
  const level = normalizeLevel(levelCode);
  const guidance: Record<RuoELevelCode, string> = {
    B1:
      "Use concrete topics, common vocabulary, clear reference chains, and mostly straightforward sentence structures.",
    B2:
      "Use varied everyday and social topics, flexible grammar, and inference that remains anchored in clear textual evidence.",
    C1:
      "Use nuanced argument, precise lexis, varied syntax, and inference across connected ideas without relying on specialist trivia.",
    C2:
      "Use subtle stance, dense but natural cohesion, idiomatic precision, and demanding inference while preserving one defensible answer.",
  };
  return guidance[level];
}

function inferLevelFromCode(taskCode: string): RuoELevelCode {
  return normalizeLevel(taskCode.slice(0, 2));
}

function normalizeLevel(levelCode: string): RuoELevelCode {
  const normalized = levelCode.trim().toUpperCase();
  return normalized === "B1" || normalized === "B2" || normalized === "C1" ||
      normalized === "C2"
    ? normalized
    : "B2";
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
