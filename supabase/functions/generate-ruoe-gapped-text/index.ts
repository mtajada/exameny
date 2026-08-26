import { serve } from "std/http/server.ts";

import { getCachedPromptTemplate } from "../_shared/prompt-loader.ts";
import { createRuoEHandler } from "../_shared/ruoe-handler.ts";
import {
  getLevelGuidance,
  getRuoETaskPromptConfig,
  getSampleThemesFor,
} from "../_shared/ruoe-layout-config.ts";
import {
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
import type { GappedTextExercise } from "../_shared/ruoe-types.ts";

const template = getCachedPromptTemplate("generate-ruoe-gapped-text");

const handler = createRuoEHandler<GappedTextExercise>({
  layout: "ruoe-gapped-text",
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
      recentTopics,
    },
  ) => {
    const config = getRuoETaskPromptConfig(metadata.taskCode);
    const levelGuidance = getLevelGuidance(metadata.level.code);
    const exampleWindow = selectExamplesForDisplay(examples, {
      maxExamples: 3,
      seed: traceId,
    });
    const examplesJsonList = stringifyExamples(exampleWindow);
    const examplesSummary = summarizeExamples(examples, {
      maxSummaries: 3,
      seed: traceId,
    });
    const placeholderExample = `{{${config.placeholderPrefix}_1}}`;
    const hasTheme = typeof teacherTheme === "string" &&
      teacherTheme.trim().length > 0;
    const rotatedTopics = hasTheme
      ? []
      : getSampleThemesFor(metadata.taskCode, metadata.level.code, 5, traceId);
    const topicBank = formatBulletList(rotatedTopics, "");
    const layoutGuidelines = formatBulletList(config.layoutGuidelines);
    const answerGuidelines = formatBulletList(config.answerGuidelines);
    const additionalNotes = formatBulletList(
      config.additionalNotes,
      "- None specified.",
    );
    const diversityGuidance = formatBulletList(
      config.diversityGuidance,
      "- Rotate discourse functions and cues while keeping the level consistent.",
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
        "Examples come first; then use these discourse-structured prompts (chronology, contrast, problem-solution) to diversify base texts and paragraph options.",
    });
    const themeGatingNote = buildTeacherThemeGatingNote(hasTheme);
    const skillFocusGatingNote = buildTeacherSkillFocusGatingNote(
      hasSkillFocus,
    );
    const skillFocusGoodBullet = hasSkillFocus
      ? "- Base text, gap placement, and option paragraphs consistently realise the Skill Focus without surfacing it."
      : "";
    const skillFocusChecksLine = hasSkillFocus
      ? `If Skill Focus is provided, confirm it is consistently present in all ${config.questionCount} gaps (discourse cues/functions aligned). `
      : "";
    const skillFocusPlanningLine = hasSkillFocus
      ? "If Skill Focus is provided, create up to five internal bullets specifying the per-item Skill Focus plan (item→gap function→cohesion device→option rationale). "
      : "";
    const recentTopicsHint = buildRecentTopicsReminder(recentTopics.hint, {
      hasTheme,
    });

    return {
      tokens: {
        examName: metadata.exam.name,
        examCode: metadata.exam.code,
        taskName: metadata.taskName,
        taskCode: metadata.taskCode,
        levelName: metadata.level.name,
        levelCode: metadata.level.code,
        questionCount: config.questionCount,
        placeholderExample,
        layoutGuidelines,
        answerGuidelines,
        additionalNotes,
        diversityGuidance,
        levelGuidance,
        topicBank,
        topicBankSection,
        recentTopicsHint,
        teacherThemeGatingNote: themeGatingNote,
        teacherSkillFocusGatingNote: skillFocusGatingNote,
        teacherSkillFocusGoodBullet: skillFocusGoodBullet,
        teacherSkillFocusChecksLine: skillFocusChecksLine,
        teacherSkillFocusPlanningLine: skillFocusPlanningLine,
        examplesJsonList,
        examplesSummary,
        teacherThemeSection: themeSection,
        teacherSkillFocusSection: skillFocusSection,
      },
      reasoningEffort: hasSkillFocus ? "high" : undefined,
    };
  },
});

serve(handler);
