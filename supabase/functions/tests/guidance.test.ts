import { assertEquals, assertMatch } from "std/testing/asserts.ts";

import {
  assessGuidance,
  DEFAULT_MAX_GUIDANCE_LENGTH,
  hashGuidance,
  sanitizeGuidance,
} from "../_shared/guidance.ts";

Deno.test("sanitizeGuidance strips control characters and trims", () => {
  const raw = "\u0007  Focus on phrasal verbs!  \n";
  const result = sanitizeGuidance(raw);
  assertEquals(result.rawLength, raw.length);
  assertEquals(result.trimmedLength, "Focus on phrasal verbs!".length);
  assertEquals(result.value, "Focus on phrasal verbs!");
  assertEquals(result.removedControlCharacters, true);
});

Deno.test("sanitizeGuidance handles non-string input", () => {
  const result = sanitizeGuidance(undefined);
  assertEquals(result.value, null);
  assertEquals(result.hadInput, false);
});

Deno.test("assessGuidance rejects whitespace-only strings", () => {
  const { isValid, errorCode } = assessGuidance("   \n\t  ");
  assertEquals(isValid, false);
  assertEquals(errorCode, "empty_after_trim");
});

Deno.test("assessGuidance enforces max length", () => {
  const long = "x".repeat(DEFAULT_MAX_GUIDANCE_LENGTH + 1);
  const { isValid, errorCode } = assessGuidance(long);
  assertEquals(isValid, false);
  assertEquals(errorCode, "too_long");
});

Deno.test("hashGuidance returns deterministic hex output", async () => {
  const hash = await hashGuidance("Guide students to reference sources.");
  assertEquals(hash.length, 32);
  assertMatch(hash, /^[0-9a-f]+$/);
  const hash2 = await hashGuidance("Guide students to reference sources.");
  assertEquals(hash, hash2);
});
