import {
  getCachedPromptTemplate,
  type PromptTemplate,
  renderPrompt,
} from "../_shared/prompt-loader.ts";

export const ALLOWED_MISTAKE_CATEGORIES = [
  "GR",
  "LX",
  "ME",
  "DC",
  "RS",
  "TA",
] as const;

export const ALLOWED_FEATURE_TAGS = [
  "TENSE_ASPECT",
  "VERB_FORM",
  "GERUND_INFINITIVE",
  "SVA",
  "ARTICLE",
  "DETERMINER",
  "PREPOSITION",
  "PRONOUN",
  "WORD_ORDER",
  "COMPARATIVE",
  "CONDITIONAL",
  "PASSIVE",
  "REPORTED_SPEECH",
  "TENSE_SEQUENCE",
  "RELATIVE_CLAUSE",
  "NEGATION",
  "QUANTIFIER",
  "MODAL",
  "QUESTION_FORM",
  "PARTICIPLE_CLAUSE",
  "INVERSION",
  "CLAUSE_SUBORDINATION",
  "SUBJUNCTIVE",
  "WORD_CHOICE",
  "COLLOCATION",
  "PHRASAL_VERB",
  "WORD_FORMATION",
  "DEPENDENT_PREPOSITION",
  "COUNTABILITY",
  "FALSE_FRIEND",
  "HOMOPHONE_CHOICE",
  "IDIOM",
  "SPELLING",
  "PUNCTUATION",
  "CAPITALIZATION",
  "HYPHENATION",
  "APOSTROPHE",
  "COMMA_RULE",
  "QUOTATION_MARKS",
  "COHESIVE_DEVICE",
  "REFERENCE",
  "SENTENCE_BOUNDARY",
  "PARAGRAPHING",
  "LOGICAL_COHERENCE",
  "MISUSED_CONNECTOR",
  "TOPIC_SENTENCE_MISSING",
  "COHERENCE_JUMP",
  "REGISTER",
  "CONCISION",
  "TONE_POLITENESS",
  "HEDGING",
  "WORD_COUNT",
  "UNDERLENGTH",
  "OVERLENGTH",
  "TASK_COVERAGE",
  "MISSING_BULLET",
  "OFF_TOPIC",
  "IMBALANCED_COVERAGE",
  "FORMAT",
  "GENRE_CONVENTIONS_ISSUE",
] as const;

export interface CriterionForPrompt {
  id: number;
  name: string;
  description?: string | null;
  criterion_code?: string | null;
}

export interface DescriptorForPrompt {
  criterion_name: string;
  score: number;
  descriptor_text: string;
}

export interface EvaluationPromptData {
  submissionText: string;
  originalPromptText: string;
  criteria: CriterionForPrompt[];
  descriptors: DescriptorForPrompt[];
  examName: string;
  levelName: string;
  taskTypeName: string;
  wordCount: number;
  maxScore: number;
}

export interface RenderedEvaluationPrompt {
  systemPrompt: string;
  userPrompt: string;
}

const PROMPT_TEMPLATE: PromptTemplate = getCachedPromptTemplate(
  "evaluate-submission",
);

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

export function buildEvaluationPrompt(
  context: EvaluationPromptData,
): RenderedEvaluationPrompt {
  const criteriaPayload = context.criteria.map((criterion) => ({
    id: criterion.id,
    name: criterion.name,
    criterion_code: criterion.criterion_code ?? null,
    description: criterion.description ?? null,
  }));

  const descriptorsPayload = context.descriptors.map((descriptor) => ({
    criterion_name: descriptor.criterion_name,
    score: descriptor.score,
    descriptor_text: descriptor.descriptor_text,
  }));

  const tokens = {
    examName: context.examName,
    levelName: context.levelName,
    taskTypeName: context.taskTypeName,
    maxScore: context.maxScore,
    originalPromptText: context.originalPromptText,
    submissionText: context.submissionText,
    wordCount: context.wordCount,
    criteriaJson: stringify(criteriaPayload),
    descriptorsJson: stringify(descriptorsPayload),
    categoriesEnum: ALLOWED_MISTAKE_CATEGORIES.join("|"),
    featureTagsList: ALLOWED_FEATURE_TAGS.join(", "),
  };

  return renderPrompt(PROMPT_TEMPLATE, tokens, { strict: true });
}
