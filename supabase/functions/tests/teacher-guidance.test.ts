import { assertEquals } from "std/testing/asserts.ts";

import {
  normalizeTeacherGuidance,
  TEACHER_GUIDANCE_FIELD_MAX,
} from "../_shared/teacher-guidance.ts";

Deno.test("normalizeTeacherGuidance accepts max-length theme and skill focus inputs", async () => {
  const theme = "t".repeat(TEACHER_GUIDANCE_FIELD_MAX);
  const skillFocus = "s".repeat(TEACHER_GUIDANCE_FIELD_MAX);
  const combined = `Theme: ${theme}\nSkill focus: ${skillFocus}`;

  const result = await normalizeTeacherGuidance({
    rawTheme: theme,
    rawSkillFocus: skillFocus,
    jsonHeaders: { "content-type": "application/json" },
    traceId: "test-trace",
  });

  assertEquals(result.theme, theme);
  assertEquals(result.skillFocus, skillFocus);
  assertEquals(result.combined, combined);
  assertEquals(result.combined?.length, combined.length);
  assertEquals(
    result.logs.combined,
    `length=${combined.length} field=combined`,
  );
});

Deno.test("normalizeTeacherGuidance returns theme-only guidance when skill focus missing", async () => {
  const theme = "Cultural festivals";

  const result = await normalizeTeacherGuidance({
    rawTheme: theme,
    rawSkillFocus: "   ",
    jsonHeaders: { "content-type": "application/json" },
    traceId: "test-trace",
  });

  assertEquals(result.theme, theme);
  assertEquals(result.skillFocus, null);
  assertEquals(result.combined, `Theme: ${theme}`);
});
