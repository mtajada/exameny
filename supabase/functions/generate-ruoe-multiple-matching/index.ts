import { serve } from "std/http/server.ts";

import { getCachedPromptTemplate } from "../_shared/prompt-loader.ts";
import { createRuoEHandler } from "../_shared/ruoe-handler.ts";
import {
  getLevelGuidance,
  getMultipleMatchingConstraintRotation,
  getRuoETaskPromptConfig,
  getSampleThemesFor,
} from "../_shared/ruoe-layout-config.ts";
import {
  buildConstraintPlan,
  buildRecentTopicsReminder,
  buildTeacherSkillFocusGatingNote,
  buildTeacherSkillFocusSection,
  buildTeacherThemeGatingNote,
  buildTeacherThemeSection,
  buildTopicBankSection,
  formatBulletList,
  selectExamplesForDisplay,
  stringifyExamples,
  summarizeExamples,
} from "../_shared/prompt-formatters.ts";
import type { MultipleMatchingExercise } from "../_shared/ruoe-types.ts";

const template = getCachedPromptTemplate("generate-ruoe-multiple-matching");

function formatLengthRange(
  range: { minWords: number; maxWords: number } | undefined | null,
): string {
  if (!range) {
    return "Keep all sections balanced and appropriate to the selected level.";
  }
  return `${range.minWords}-${range.maxWords} words per section`;
}

const handler = createRuoEHandler<MultipleMatchingExercise>({
  layout: "ruoe-multiple-matching",
  template,
  defaultTemperature: 0.6,
  defaultReasoningEffort: "medium",
  buildPromptContext: (
    {
      traceId,
      metadata,
      teacherTheme,
      teacherSkillFocus,
      examples,
      recentTopics,
    },
  ) => {
    const config = getRuoETaskPromptConfig(metadata.taskCode);
    const levelGuidance = getLevelGuidance(metadata.level.code);
    const exampleWindow = selectExamplesForDisplay(examples, {
      maxExamples: 3,
      seed: traceId,
    });
    const exampleJsonList = stringifyExamples(exampleWindow);
    const examplesSummary = summarizeExamples(examples, {
      maxSummaries: 3,
      seed: traceId,
    });
    const sectionLettersList =
      config.sectionLetters && config.sectionLetters.length > 0
        ? config.sectionLetters.join(", ")
        : "A, B, C, D";
    const layoutGuidelines = formatBulletList(config.layoutGuidelines);
    const answerGuidelines = formatBulletList(config.answerGuidelines);
    const additionalNotes = formatBulletList(
      config.additionalNotes,
      "- None specified.",
    );
    const hasTheme = typeof teacherTheme === "string" &&
      teacherTheme.trim().length > 0;
    const rotatedTopics = hasTheme
      ? []
      : getSampleThemesFor(metadata.taskCode, metadata.level.code, 5, traceId);
    const topicBank = formatBulletList(rotatedTopics, "");
    const questionFocusGuidelines = formatBulletList(
      config.questionFocusGuidelines,
    );
    const coverageGuidelines = formatBulletList(config.coverageGuidelines);
    const diversityGuidance = formatBulletList(
      config.diversityGuidance,
      "- Rotate speaker profiles, evidence types, and tone while keeping the product layout consistent.",
    );
    const themeSection = buildTeacherThemeSection(teacherTheme);
    const skillFocusSection = buildTeacherSkillFocusSection(teacherSkillFocus);
    const hasSkillFocus = typeof teacherSkillFocus === "string" &&
      teacherSkillFocus.trim().length > 0;
    const topicBankSection = buildTopicBankSection({
      heading: config.topicBankHeading,
      bullets: rotatedTopics,
      hasTheme,
      inspirationLine:
        "Use these logistics- and preference-driven briefs (time, budget, access, priorities) only after analysing the examples; treat them as springboards, not scripts.",
    });
    const themeGatingNote = buildTeacherThemeGatingNote(hasTheme);
    const skillFocusGatingNote = buildTeacherSkillFocusGatingNote(
      hasSkillFocus,
    );
    const skillFocusGoodBullet = hasSkillFocus
      ? "- Sections and statements are intentionally designed so that every statement relies on cues aligned with the Skill Focus."
      : "";
    const skillFocusChecksLine = hasSkillFocus
      ? `If Skill Focus is provided, verify coverage across all ${config.questionCount} statements; each relies on evidence/cues consistent with the Skill Focus. `
      : "";
    const skillFocusPlanningLine = hasSkillFocus
      ? "If Skill Focus is provided, create up to five internal bullets specifying the per-item Skill Focus plan (item→statement focus→section evidence→Skill Focus alignment). "
      : "";
    const recentTopicsHint = buildRecentTopicsReminder(recentTopics.hint, {
      hasTheme,
    });
    const constraintPlan = buildConstraintPlan(
      getMultipleMatchingConstraintRotation(metadata.level.code),
      config.questionCount,
      { seed: traceId },
    );

    return {
      tokens: {
        examName: metadata.exam.name,
        examCode: metadata.exam.code,
        taskName: metadata.taskName,
        taskCode: metadata.taskCode,
        levelName: metadata.level.name,
        levelCode: metadata.level.code,
        questionCount: config.questionCount,
        layoutGuidelines,
        answerGuidelines,
        additionalNotes,
        levelGuidance,
        topicBank,
        sectionLettersList,
        sectionLengthTarget: formatLengthRange(config.sectionLengthTargets),
        sectionCountSummary: config.sectionCountSummary ??
          "Follow the clean-room product configuration for the number of sections.",
        questionFocusGuidelines,
        coverageGuidelines,
        diversityGuidance,
        reusePolicyNote: config.reusePolicyNote ??
          "Letters may be reused when evidence supports it.",
        recentTopicsHint,
        constraintPlan,
        examplesJsonList: exampleJsonList,
        examplesSummary,
        teacherThemeSection: themeSection,
        teacherSkillFocusSection: skillFocusSection,
        topicBankSection,
        teacherThemeGatingNote: themeGatingNote,
        teacherSkillFocusGatingNote: skillFocusGatingNote,
        teacherSkillFocusGoodBullet: skillFocusGoodBullet,
        teacherSkillFocusChecksLine: skillFocusChecksLine,
        teacherSkillFocusPlanningLine: skillFocusPlanningLine,
      },
      reasoningEffort: hasSkillFocus ? "high" : undefined,
    };
  },
});

serve(handler);
