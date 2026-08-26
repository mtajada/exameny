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
import type { MCQClozeExercise } from "../_shared/ruoe-types.ts";

const template = getCachedPromptTemplate("generate-ruoe-mc-cloze");

const handler = createRuoEHandler<MCQClozeExercise>({
  layout: "ruoe-mc-cloze",
  template,
  defaultTemperature: 0.55,
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
    const placeholderExample = `{{${config.placeholderPrefix}_1}}`;
    const optionLetters = config.optionLetters ?? ["A", "B", "C", "D"];
    const hasTheme = typeof teacherTheme === "string" &&
      teacherTheme.trim().length > 0;
    const hasSkillFocus = typeof teacherSkillFocus === "string" &&
      teacherSkillFocus.trim().length > 0;
    const rotatedTopics = getSampleThemesFor(
      metadata.taskCode,
      metadata.level.code,
      5,
      traceId,
    );
    const rotatedTopicBank = buildTopicBankSection({
      heading:
        `=== Optional Level ${metadata.level.code} topic ideas (rotating) ===`,
      bullets: rotatedTopics,
      hasTheme,
      inspirationLine:
        "Use these neutral ideas to keep themes fresh without repeating recent work.",
    });
    const recentTopicsHint = buildRecentTopicsReminder(recentTopics.hint, {
      hasTheme,
      prefix: "- Consider a different angle than these recent topics.",
    });
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
      "- Rotate scenarios while keeping the product structure and level consistent.",
    );
    const themeSection = buildTeacherThemeSection(teacherTheme);
    const skillFocusSection = buildTeacherSkillFocusSection(teacherSkillFocus);
    const themeGatingNote = buildTeacherThemeGatingNote(hasTheme);
    const skillFocusGatingNote = buildTeacherSkillFocusGatingNote(
      hasSkillFocus,
    );
    const skillFocusGoodBullet = hasSkillFocus
      ? "- Every gap and its distractors are crafted to reflect the Skill Focus implicitly across the entire set."
      : "";
    const skillFocusChecksLine = hasSkillFocus
      ? `If Skill Focus is provided, verify it is consistently realised in all ${config.questionCount} items (gap context and distractors) without revealing it. `
      : "";
    const skillFocusPlanningLine = hasSkillFocus
      ? "If Skill Focus is provided, create up to five internal bullets specifying the per-item Skill Focus plan (item→device/operator/distractor strategy). "
      : "";

    // Elevate reasoning effort only for Part 1 of R&UoE in B2/C1/C2
    // (B2_LANG_MC_CLOZE, C1_LANG_MC_CLOZE, C2_LANG_MC_CLOZE). Other tasks keep default.
    const isHighReasoningTask = metadata.taskCode === "B2_LANG_MC_CLOZE" ||
      metadata.taskCode === "C1_LANG_MC_CLOZE" ||
      metadata.taskCode === "C2_LANG_MC_CLOZE";

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
        placeholderExample,
        layoutGuidelines,
        answerGuidelines,
        additionalNotes,
        diversityGuidance,
        levelGuidance,
        rotatedTopicBank,
        teacherThemeGatingNote: themeGatingNote,
        teacherSkillFocusGatingNote: skillFocusGatingNote,
        teacherSkillFocusGoodBullet: skillFocusGoodBullet,
        teacherSkillFocusChecksLine: skillFocusChecksLine,
        teacherSkillFocusPlanningLine: skillFocusPlanningLine,
        examplesJsonList,
        examplesSummary,
        teacherThemeSection: themeSection,
        teacherSkillFocusSection: skillFocusSection,
        recentTopicsHint,
      },
      reasoningEffort: (hasSkillFocus || isHighReasoningTask)
        ? "high"
        : undefined,
      temperature: hasSkillFocus ? 0.5 : undefined,
    };
  },
});

serve(handler);
