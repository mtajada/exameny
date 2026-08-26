import {
  assessGuidance,
  guidanceToLogString,
  hashGuidance,
} from "./guidance.ts";

const THEME_PREFIX = "Theme: ";
const SKILL_FOCUS_PREFIX = "Skill focus: ";
const COMBINED_SEPARATOR = "\n";

export const TEACHER_GUIDANCE_FIELD_MAX = 200;
// Include separator length so max-length theme and skill focus inputs remain valid together.
const COMBINED_MAX_LENGTH = TEACHER_GUIDANCE_FIELD_MAX * 2 +
  THEME_PREFIX.length +
  SKILL_FOCUS_PREFIX.length +
  COMBINED_SEPARATOR.length;

interface NormalizeParams {
  rawTheme: unknown;
  rawSkillFocus: unknown;
  jsonHeaders: HeadersInit;
  traceId: string;
}

interface GuidanceLogBundle {
  theme: string;
  skillFocus: string;
  combined: string;
  summary: string;
}

export interface NormalizedTeacherGuidance {
  combined: string | null;
  theme: string | null;
  skillFocus: string | null;
  logs: GuidanceLogBundle;
}

function resolveStatus(code: "too_long" | "empty_after_trim"): number {
  return code === "too_long" ? 413 : 400;
}

function buildCombined(
  theme: string | null,
  skillFocus: string | null,
): string | null {
  const parts: string[] = [];
  if (theme) parts.push(`${THEME_PREFIX}${theme}`);
  if (skillFocus) parts.push(`${SKILL_FOCUS_PREFIX}${skillFocus}`);
  return parts.length > 0 ? parts.join(COMBINED_SEPARATOR) : null;
}

function guidanceLog(
  assessment: ReturnType<typeof assessGuidance>,
  label: string,
): string {
  if (assessment.errorCode === "empty_after_trim") {
    return `length=0 ignored_empty field=${label}`;
  }
  return `${guidanceToLogString(assessment)} field=${label}`;
}

export async function normalizeTeacherGuidance(
  params: NormalizeParams,
): Promise<NormalizedTeacherGuidance> {
  const { rawTheme, rawSkillFocus, jsonHeaders, traceId } = params;

  const themeAssessment = assessGuidance(rawTheme, TEACHER_GUIDANCE_FIELD_MAX);
  if (
    !themeAssessment.isValid && themeAssessment.errorCode !== "empty_after_trim"
  ) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: themeAssessment.errorMessage ?? "Invalid theme.",
        traceId,
      }),
      {
        status: resolveStatus(themeAssessment.errorCode ?? "empty_after_trim"),
        headers: jsonHeaders,
      },
    );
  }

  const skillFocusAssessment = assessGuidance(
    rawSkillFocus,
    TEACHER_GUIDANCE_FIELD_MAX,
  );
  if (
    !skillFocusAssessment.isValid &&
    skillFocusAssessment.errorCode !== "empty_after_trim"
  ) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: skillFocusAssessment.errorMessage ?? "Invalid skill focus.",
        traceId,
      }),
      {
        status: resolveStatus(
          skillFocusAssessment.errorCode ?? "empty_after_trim",
        ),
        headers: jsonHeaders,
      },
    );
  }

  const theme = themeAssessment.sanitized.value;
  const skillFocus = skillFocusAssessment.sanitized.value;

  const combined = buildCombined(theme, skillFocus);
  const combinedAssessment = assessGuidance(combined, COMBINED_MAX_LENGTH);
  const hashPrefix = combined ? await hashGuidance(combined, 8) : null;

  const summaryParts = [
    `lengthTheme=${theme ? theme.length : 0}`,
    `lengthSkillFocus=${skillFocus ? skillFocus.length : 0}`,
    `lengthCombined=${combined ? combined.length : 0}`,
  ];
  if (hashPrefix) summaryParts.push(`hash=${hashPrefix}`);

  return {
    combined,
    theme: theme ?? null,
    skillFocus: skillFocus ?? null,
    logs: {
      theme: guidanceLog(themeAssessment, "theme"),
      skillFocus: guidanceLog(skillFocusAssessment, "skillFocus"),
      combined: guidanceLog(combinedAssessment, "combined"),
      summary: summaryParts.join(" "),
    },
  };
}
