import { serve } from "std/http/server.ts";

import { getCachedPromptTemplate } from "../_shared/prompt-loader.ts";
import { createRuoEHandler } from "../_shared/ruoe-handler.ts";
import {
  getLevelGuidance,
  getRuoETaskPromptConfig,
} from "../_shared/ruoe-layout-config.ts";
import {
  buildTeacherSkillFocusGatingNote,
  formatBulletList,
  selectExamplesForDisplay,
  stringifyExamples,
  summarizeExamples,
} from "../_shared/prompt-formatters.ts";
import type { KeyWordTransformationExercise } from "../_shared/ruoe-types.ts";

const template = getCachedPromptTemplate(
  "generate-ruoe-keyword-transformation",
);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface WordWindowTokens {
  range: string;
  rubricPhrase: string;
}

function resolveWordWindowTokens(levelCode: string): WordWindowTokens {
  const normalized = levelCode.toUpperCase();
  switch (normalized) {
    case "B2":
      return {
        range: "2–5",
        rubricPhrase: "between two and five words, including the word given",
      };
    case "C1":
      return {
        range: "3–6",
        rubricPhrase: "in three to six words, including the word given",
      };
    case "C2":
      return {
        range: "3–8",
        rubricPhrase: "in 3–8 words, including the word given",
      };
    default:
      return {
        range: "3–6",
        rubricPhrase: "in three to six words, including the word given",
      };
  }
}

function resolveOperatorsForLevel(levelCode: string): string {
  const normalized = levelCode.toUpperCase();
  switch (normalized) {
    case "B2":
      return "look forward to -ing; not as/so + adj + as; wish + past/could; be sold out of; not mean to + V.";
    case "C1":
      return "give a (clear) explanation of/about; is alleged to have + Vpp; make (no/little) difference to + NP; If it hadn't been for + NP; do whatever/everything/anything it takes; withdrawn in (the) light of.";
    case "C2":
      return "make one's way; not (to) take sides; be under threat (due to/owing to/because of ...); not open to further discussion; no matter how + adj/adv; catch a glimpse/sight of.";
    default:
      return "give a (clear) explanation of/about; is alleged to have + Vpp; make (no/little) difference to + NP; If it hadn't been for + NP; do whatever/everything/anything it takes; withdrawn in (the) light of.";
  }
}

function inferSkillFocusKeyword(
  rawValue: string | null | undefined,
): string | undefined {
  if (!rawValue) return undefined;
  const cleaned = rawValue.trim();
  if (cleaned.length === 0) return undefined;
  const patterns: RegExp[] = [
    /use\s+([a-zA-Z'´]+)\s+as\s+the\s+keyword/i,
    /keyword\s*(?:=|:)\s*([a-zA-Z'´]+)/i,
    /keyword\s+(?:is|will\s+be|va\s+a\s+ser|será)\s+([a-zA-Z'´]+)/i,
    /palabra\s+clave\s*(?:=|:)\s*([a-zA-Z'´]+)/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const token = match[1].replace(/[´’]/g, "'");
      return token.toUpperCase();
    }
  }
  return undefined;
}

function collectExampleKeywordBank(
  examples: KeyWordTransformationExercise[],
): string[] {
  const keywordToSample = new Map<string, string>();

  for (const example of examples ?? []) {
    const questions = Array.isArray(example?.questions)
      ? example.questions
      : [];
    for (const question of questions) {
      const rawKeyword = typeof question?.questionText === "string"
        ? question.questionText.trim()
        : "";
      if (!rawKeyword) continue;
      const keyword = rawKeyword.toUpperCase();
      if (keywordToSample.has(keyword)) continue;

      const correctAnswers = Array.isArray(question?.correctAnswers)
        ? question.correctAnswers
        : [];
      const firstAnswer = typeof correctAnswers[0] === "string"
        ? correctAnswers[0].trim()
        : "";
      keywordToSample.set(keyword, firstAnswer);
    }
  }

  return Array.from(keywordToSample.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([keyword, sample]) => (sample ? `${keyword} → ${sample}` : keyword));
}

const handler = createRuoEHandler<KeyWordTransformationExercise>({
  layout: "ruoe-keyword-transformation",
  template,
  defaultTemperature: 0.45,
  defaultReasoningEffort: "medium",
  buildPromptContext: (
    {
      traceId,
      metadata,
      teacherTheme,
      teacherSkillFocus,
      examples,
      recentTopics: _recentTopics,
    },
  ) => {
    // Defense-in-depth: ensure examples align with the exact exam/level/part for this task
    const expectedExam = metadata.exam.code;
    const expectedLevel = metadata.level.code;
    const expectedPart = metadata.taskCode.split("_").slice(1).join("_");
    const hasMismatch = Array.isArray(examples) &&
      examples.some((ex: unknown) => {
        const rec = isPlainRecord(ex) ? ex : null;
        const meta = rec && isPlainRecord(rec.metadata) ? rec.metadata : null;
        if (!meta) return false;
        const examOk = typeof meta.examCode === "string"
          ? meta.examCode === expectedExam
          : true;
        const levelOk = typeof meta.level === "string"
          ? meta.level === expectedLevel
          : true;
        const partOk = typeof meta.partCode === "string"
          ? meta.partCode === expectedPart
          : true;
        return !(examOk && levelOk && partOk);
      });
    if (hasMismatch) {
      throw new Error(
        `Optional source material does not match collection=${expectedExam}, level=${expectedLevel}, activity=${expectedPart}`,
      );
    }
    const config = getRuoETaskPromptConfig(metadata.taskCode);
    const levelGuidance = getLevelGuidance(metadata.level.code);
    const wordWindowTokens = resolveWordWindowTokens(metadata.level.code);
    const operatorsForLevel = resolveOperatorsForLevel(metadata.level.code);
    const trimmedTheme = typeof teacherTheme === "string"
      ? teacherTheme.trim()
      : "";
    const hasTheme = trimmedTheme.length > 0;
    const exampleWindow = selectExamplesForDisplay(examples, {
      maxExamples: 3,
      seed: traceId,
    });
    const examplesJsonList = stringifyExamples(exampleWindow);
    const examplesSummary = summarizeExamples(examples, {
      maxSummaries: 3,
      seed: traceId,
    });
    const exampleKeywordBank = collectExampleKeywordBank(examples);
    const exampleKeywordsList = formatBulletList(
      exampleKeywordBank,
      "- No example-derived keywords available for this request.",
    );
    const layoutGuidelines = formatBulletList(config.layoutGuidelines);
    const answerGuidelines = formatBulletList(config.answerGuidelines);
    const additionalNotes = formatBulletList(
      config.additionalNotes,
      "- None specified.",
    );
    const diversityGuidance = formatBulletList(
      config.diversityGuidance,
      "- Rotate transformation types and contexts while keeping the level consistent.",
    );
    const trimmedSkillFocus = typeof teacherSkillFocus === "string"
      ? teacherSkillFocus.trim()
      : "";
    const hasRequestedSkillFocus = trimmedSkillFocus.length > 0;
    const focusKeyword = hasRequestedSkillFocus
      ? inferSkillFocusKeyword(trimmedSkillFocus)
      : undefined;
    const themeSection = hasTheme
      ? [
        "=== Theme ===",
        "If provided, use this theme exclusively; override rotating banks (topic lists, inspiration prompts) that conflict with it.",
        trimmedTheme,
      ].join("\n")
      : "";
    const skillFocusSection = hasRequestedSkillFocus
      ? [
        "=== Skill Focus (Hidden) ===",
        "Teacher focus overrides rotation and optional inspiration lists. Use it to shape every item implicitly.",
        "Ground scenarios in the level-aligned operator bank and clean-room constraints (and Teacher Theme if present) before considering optional scaffolding.",
        `- Target focus: ${trimmedSkillFocus}`,
      ].join("\n")
      : "";
    const themeGatingNote = hasTheme
      ? "Teacher Theme provided. Ground the entire scenario in this guidance; override rotating banks (topic lists, inspiration prompts) whenever they conflict."
      : "No Teacher Theme provided. Analyse the level-aligned operator bank first, then consult neutral inspiration lists only if you need additional angles.";
    const skillFocusGatingNote = hasRequestedSkillFocus
      ? buildTeacherSkillFocusGatingNote(true)
      : "";
    const skillFocusGoodBullet = hasRequestedSkillFocus
      ? `- Every item realises the teacher Skill Focus${
        focusKeyword ? ` (keyword ${focusKeyword})` : ""
      } implicitly; override general diversity guidance whenever it conflicts.`
      : "";
    const skillFocusChecksLine = hasRequestedSkillFocus
      ? `If Skill Focus is provided, verify every transformation (all ${config.questionCount}) realises it implicitly through keyword/operator choice and constraints${
        focusKeyword ? ` and keeps the keyword ${focusKeyword} unchanged` : ""
      }. `
      : "";
    const skillFocusPlanningLine = hasRequestedSkillFocus
      ? `If Skill Focus is provided, plan how each item will realise it (keyword choice + transformation family + boundary tokens) before drafting any sentences.${
        focusKeyword
          ? ` Keep the keyword ${focusKeyword} unchanged in all accepted answers.`
          : ""
      } `
      : "";
    const scenarioGuidance =
      "Use the level-aligned operator bank as primary guidance: keep the keyword unchanged in accepted answers, rotate transformation families, and create fresh contexts from a blank page.";

    return {
      tokens: {
        examName: metadata.exam.name,
        examCode: metadata.exam.code,
        taskName: metadata.taskName,
        taskCode: metadata.taskCode,
        levelName: metadata.level.name,
        levelCode: metadata.level.code,
        wordWindowRange: wordWindowTokens.range,
        wordWindowRubricPhrase: wordWindowTokens.rubricPhrase,
        operatorsForLevel,
        questionCount: config.questionCount,
        layoutGuidelines,
        answerGuidelines,
        additionalNotes,
        diversityGuidance,
        levelGuidance,
        scenarioGuidance,
        teacherThemeGatingNote: themeGatingNote,
        teacherSkillFocusGatingNote: skillFocusGatingNote,
        teacherSkillFocusGoodBullet: skillFocusGoodBullet,
        teacherSkillFocusChecksLine: skillFocusChecksLine,
        teacherSkillFocusPlanningLine: skillFocusPlanningLine,
        exampleKeywordsList,
        examplesJsonList,
        examplesSummary,
        teacherThemeSection: themeSection,
        teacherSkillFocusSection: skillFocusSection,
        // Expose literal placeholder token so the strict renderer keeps `{{GAP_n}}` in the prompt body.
        gapPlaceholderToken: "{{GAP_n}}",
      },
      reasoningEffort: hasRequestedSkillFocus ? "high" : undefined,
    };
  },
});

serve(handler);
