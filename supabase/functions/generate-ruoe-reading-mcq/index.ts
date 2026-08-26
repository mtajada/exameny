import { serve } from "std/http/server.ts";

import { getCachedPromptTemplate } from "../_shared/prompt-loader.ts";
import { createRuoEHandler } from "../_shared/ruoe-handler.ts";
import {
  getLevelGuidance,
  getReadingMcqFocusRotation,
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
import type { ReadingMultipleChoiceExercise } from "../_shared/ruoe-types.ts";

const template = getCachedPromptTemplate("generate-ruoe-reading-mcq");

const handler = createRuoEHandler<ReadingMultipleChoiceExercise>({
  layout: "ruoe-reading-mcq",
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
    const optionLetters = config.optionLetters ?? ["A", "B", "C", "D"];
    const hasTheme = typeof teacherTheme === "string" &&
      teacherTheme.trim().length > 0;
    const rotatedTopics = hasTheme
      ? []
      : getSampleThemesFor(metadata.taskCode, metadata.level.code, 5, traceId);
    const topicBank = formatBulletList(rotatedTopics, "");
    const exampleWindow = selectExamplesForDisplay(examples, {
      maxExamples: 3,
      seed: traceId,
    });
    const examplesJsonList = stringifyExamples(exampleWindow);
    const examplesSummary = summarizeExamples(examples, {
      maxSummaries: 3,
      seed: traceId,
    });
    const layoutGuidelines = formatBulletList(config.layoutGuidelines);
    const answerGuidelines = formatBulletList(config.answerGuidelines);
    const additionalNotes = formatBulletList(
      config.additionalNotes,
      "- None specified.",
    );
    const diversityGuidance = formatBulletList(
      config.diversityGuidance,
      "- Rotate genres, question types, and evidence cues while keeping the product structure consistent.",
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
        "Use these neutral communicative intents only to widen coverage without recycling recent academy topics.",
    });
    const themeGatingNote = buildTeacherThemeGatingNote(hasTheme);
    const skillFocusGatingNote = buildTeacherSkillFocusGatingNote(
      hasSkillFocus,
    );
    const skillFocusGoodBullet = hasSkillFocus
      ? "- All questions are crafted around the Skill Focus implicitly (e.g., inference/purpose/attitude/vocab-in-context as dictated by the focus), and distractors reflect it."
      : "";
    const skillFocusChecksLine = hasSkillFocus
      ? `If Skill Focus is provided, confirm that every question (all ${config.questionCount}) is aligned to it; re-plan items that do not reflect the focus. `
      : "";
    const skillFocusPlanningLine = hasSkillFocus
      ? "If Skill Focus is provided, create up to five internal bullets specifying the per-item Skill Focus plan (item→device/operator/distractor strategy). "
      : "";
    const recentTopicsHint = buildRecentTopicsReminder(recentTopics.hint, {
      hasTheme,
    });
    const focusRotation = selectExamplesForDisplay(
      getReadingMcqFocusRotation(metadata.level.code),
      {
        maxExamples: config.questionCount,
        seed: traceId,
      },
    );
    const questionFocusPlan = focusRotation.length > 0
      ? focusRotation.map((focus, index) => `- Q${index + 1}: ${focus}`).join(
        "\n",
      )
      : "";

    return {
      tokens: {
        examName: metadata.exam.name,
        examCode: metadata.exam.code,
        taskName: metadata.taskName,
        taskCode: metadata.taskCode,
        levelName: metadata.level.name,
        levelCode: metadata.level.code,
        questionCount: config.questionCount,
        optionLetters: optionLetters.join(", "),
        layoutGuidelines,
        answerGuidelines,
        additionalNotes,
        diversityGuidance,
        levelGuidance,
        topicBank,
        topicBankSection,
        recentTopicsHint,
        questionFocusPlan,
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
      temperature: hasSkillFocus ? 0.4 : undefined,
    };
  },
});

serve(handler);
