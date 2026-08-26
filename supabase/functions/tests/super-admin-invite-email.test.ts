import { assertEquals } from "std/testing/asserts.ts";

import { normalizeEmail } from "../super-admin-invite/email-utils.ts";

Deno.test("normalizeEmail returns undefined for non-string values", () => {
  assertEquals(normalizeEmail(undefined), undefined);
  assertEquals(normalizeEmail(null), undefined);
  assertEquals(normalizeEmail(42), undefined);
});

Deno.test("normalizeEmail trims and lowercases valid emails", () => {
  assertEquals(normalizeEmail("  ADMIN@ExAmPlE.Com  "), "admin@example.com");
});

Deno.test("normalizeEmail returns undefined for empty strings after trim", () => {
  assertEquals(normalizeEmail("   "), undefined);
});
