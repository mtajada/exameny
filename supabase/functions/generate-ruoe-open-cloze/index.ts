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
import type { OpenClozeExercise } from "../_shared/ruoe-types.ts";

const template = getCachedPromptTemplate("generate-ruoe-open-cloze");

const handler = createRuoEHandler<OpenClozeExercise>({
  layout: "ruoe-open-cloze",
  template,
  defaultTemperature: 0.5,
  defaultReasoningEffort: "high",
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
    const placeholderExample = `{{${config.placeholderPrefix}_1}}`;
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
      "- Rotate grammar targets while keeping tone and structure consistent.",
    );
    const themeSection = buildTeacherThemeSection(teacherTheme);
    const skillFocusSection = buildTeacherSkillFocusSection(teacherSkillFocus);
    const hasSkillFocus = typeof teacherSkillFocus === "string" &&
      teacherSkillFocus.trim().length > 0;
    const topicBankSection = buildTopicBankSection(
      config.topicBankHeading,
      rotatedTopics,
      hasTheme,
    );
    const themeGatingNote = buildTeacherThemeGatingNote(hasTheme);
    const skillFocusGatingNote = buildTeacherSkillFocusGatingNote(
      hasSkillFocus,
    );
    const skillFocusGoodBullet = hasSkillFocus
      ? "- Every gap and rationale is implicitly shaped by the Skill Focus; device choices (articles, linkers, pronouns, verb phrases) consistently reflect it."
      : "";
    const skillFocusChecksLine = hasSkillFocus
      ? `If Skill Focus is provided, internally confirm it is consistently realised across all ${config.questionCount} items (every gap reflects it implicitly through grammar/lexis choices) before replying. `
      : "";
    const skillFocusPlanningLine = hasSkillFocus
      ? "If Skill Focus is provided, create up to five internal bullets specifying the per-item Skill Focus plan (item→grammar target→cohesion cue→implicit reinforcement). "
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
