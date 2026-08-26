import { serve } from "std/http/server.ts";

import { getCachedPromptTemplate } from "../_shared/prompt-loader.ts";
import { createRuoEHandler } from "../_shared/ruoe-handler.ts";
import {
  CROSS_TEXT_BALANCE_REQUIREMENTS,
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
import type { CrossTextMatchingExercise } from "../_shared/ruoe-types.ts";

const template = getCachedPromptTemplate("generate-ruoe-cross-text");

const handler = createRuoEHandler<CrossTextMatchingExercise>({
  layout: "ruoe-cross-text",
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
    const levelCode = typeof metadata.level.code === "string"
      ? metadata.level.code.toUpperCase()
      : "C1";
    const hasTheme = typeof teacherTheme === "string" &&
      teacherTheme.trim().length > 0;
    const rotatedTopics = hasTheme
      ? []
      : getSampleThemesFor(metadata.taskCode, metadata.level.code, 5, traceId);
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
      "- Differentiate stances, evidence types, and tone while keeping the level consistent.",
    );
    const themeSection = buildTeacherThemeSection(teacherTheme);
    const skillFocusSection = buildTeacherSkillFocusSection(teacherSkillFocus);
    const hasSkillFocus = typeof teacherSkillFocus === "string" &&
      teacherSkillFocus.trim().length > 0;
    const balanceRequirements = formatBulletList(
      CROSS_TEXT_BALANCE_REQUIREMENTS,
    );
    const topicBankHeading = config.topicBankHeading
      ? `${config.topicBankHeading} — Level ${levelCode} rotation`
      : undefined;
    const topicBankSection = buildTopicBankSection({
      heading: topicBankHeading,
      bullets: rotatedTopics,
      hasTheme,
      inspirationLine:
        `Use these Level ${levelCode} stakeholder scenarios as springboards, not scripts; create every text from a blank page.`,
    });
    const themeGatingNote = buildTeacherThemeGatingNote(hasTheme);
    const skillFocusGatingNote = buildTeacherSkillFocusGatingNote(
      hasSkillFocus,
    );
    const skillFocusGoodBullet = hasSkillFocus
      ? "- All questions target contrasts/alignments framed by the Skill Focus; each text’s stance/evidence helps test that focus implicitly."
      : "";
    const skillFocusChecksLine = hasSkillFocus
      ? `If Skill Focus is provided, verify consistent realisation across all ${config.questionCount} comparisons/alignments. `
      : "";
    const skillFocusPlanningLine = hasSkillFocus
      ? "If Skill Focus is provided, create up to five internal bullets specifying the per-item Skill Focus plan (item→stance pairing→evidence anchor→Skill Focus alignment). "
      : "";
    const recentTopicsHint = buildRecentTopicsReminder(recentTopics.hint, {
      hasTheme,
      prefix: "- Consider a different angle than these recent topics.",
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
        layoutGuidelines,
        answerGuidelines,
        additionalNotes,
        diversityGuidance,
        balanceRequirements,
        levelGuidance,
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
