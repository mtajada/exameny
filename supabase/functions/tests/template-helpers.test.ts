import { assertEquals, assertStringIncludes } from "std/testing/asserts.ts";
import {
  buildAuthUrl,
  normalizeAcademyName,
  sanitizeSiteUrl,
  toHumanDate,
  wrapEmailLayout,
} from "../_shared/templates/template-helpers.ts";

Deno.test("template helper utilities normalize urls and names", () => {
  assertEquals(
    sanitizeSiteUrl("https://example.com///"),
    "https://example.com",
  );
  assertEquals(sanitizeSiteUrl(""), "http://127.0.0.1:8080");
  assertEquals(
    buildAuthUrl("https://learning.example.org/"),
    "https://learning.example.org/auth",
  );
  assertEquals(normalizeAcademyName("  "), "your academy");
  assertEquals(normalizeAcademyName("B2 Academy"), "B2 Academy");
});

Deno.test("toHumanDate parses ISO strings and ignores invalid values", () => {
  assertEquals(toHumanDate("2025-02-01"), "Feb 1, 2025");
  assertEquals(toHumanDate("not-a-date"), null);
  assertEquals(toHumanDate(null), null);
});

Deno.test("wrapEmailLayout injects academy name and CTA section", () => {
  const html = wrapEmailLayout({
    academyName: "North Academy",
    innerHtml: "<p>Welcome!</p>",
  });

  assertStringIncludes(html, "North Academy");
  assertStringIncludes(html, "<p>Welcome!</p>");
  assertStringIncludes(html, "Notifications managed by");
});
