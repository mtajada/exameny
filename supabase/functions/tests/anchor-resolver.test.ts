import { assert, assertEquals } from "std/testing/asserts.ts";

import {
  type AnchorResolution,
  DEFAULT_ANCHOR_RESOLVER_OPTIONS,
  resolveAnchorPatch,
} from "../_shared/anchor-resolver.ts";

function assertAnchored(
  result: AnchorResolution,
  submissionText: string,
  expectedText: string,
) {
  assertEquals(result.status, "anchored");
  if (result.status !== "anchored") return;
  assert(result.start >= 0 && result.end <= submissionText.length);
  assertEquals(submissionText.slice(result.start, result.end), expectedText);
}

Deno.test("resolveAnchorPatch anchors a composite unique match", () => {
  const submissionText = "The quick brown fox jumps over the lazy dog.";
  const patch = {
    before: "brown",
    after: null,
    contextBefore: "The quick ",
    contextAfter: " fox jumps",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertAnchored(result, submissionText, "brown");
  if (result.status === "anchored") {
    assertEquals(result.strategy, "composite");
  }
});

Deno.test("resolveAnchorPatch anchors a unique before match", () => {
  const submissionText = "She can sing well.";
  const patch = {
    before: "sing",
    after: null,
    contextBefore: "",
    contextAfter: "",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertAnchored(result, submissionText, "sing");
  if (result.status === "anchored") {
    assertEquals(result.strategy, "before_unique");
  }
});

Deno.test("resolveAnchorPatch disambiguates repeated before with context scoring", () => {
  const submissionText = "I like red apples and green apples.";
  const patch = {
    before: "apples",
    after: null,
    contextBefore: "red ",
    contextAfter: " and",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertAnchored(result, submissionText, "apples");
  if (result.status === "anchored") {
    assertEquals(result.strategy, "context_score");
    assertEquals(result.start, submissionText.indexOf("apples"));
  }
});

Deno.test("resolveAnchorPatch returns ambiguous when score passes but margin misses MIN_MARGIN", () => {
  const before = "::ANCHOR::";
  const contextBefore = "0123456789ABCDEFGHIJKLMNOP"; // len 26
  const actualBest = "0123456789ZBCDEFGHIJKLMNOP"; // distance 1 -> score ~0.9615
  const actualSecond = "0123456789ZBCDZFGHZJKLMNOP"; // distance 3 -> score ~0.8846 (margin ~0.0769)

  const submissionText =
    `${actualBest}${before} middle ${actualSecond}${before}`;
  const patch = { before, after: null, contextBefore, contextAfter: "" };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "ambiguous");
  if (result.status === "ambiguous") {
    assertEquals(result.strategy, "context_score");
    assertEquals(result.candidates, 2);
  }

  const anchored = resolveAnchorPatch(submissionText, patch, {
    minMargin: 0.07,
  });
  assertAnchored(anchored, submissionText, before);
  if (anchored.status === "anchored") {
    assertEquals(anchored.strategy, "context_score");
    assertEquals(anchored.start, actualBest.length);
  }
});

Deno.test("resolveAnchorPatch returns ambiguous when margin passes but best score misses MIN_SCORE", () => {
  const before = "::ANCHOR::";
  const contextBefore = "abcxefghxjklmxopqrxtuvwxy"; // len 25
  const actualBest = "abcdefghijklmnopqrstuvwxy"; // distance 4 -> score 0.84
  const actualWorst = "zzzzzzzzzzzzzzzzzzzzzzzzz"; // distance 25 -> score 0

  const submissionText =
    `${actualBest}${before} middle ${actualWorst}${before}`;
  const patch = { before, after: null, contextBefore, contextAfter: "" };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "ambiguous");
  if (result.status === "ambiguous") {
    assertEquals(result.strategy, "context_score");
    assertEquals(result.candidates, 2);
  }

  const anchored = resolveAnchorPatch(submissionText, patch, {
    minScore: 0.83,
  });
  assertAnchored(anchored, submissionText, before);
  if (anchored.status === "anchored") {
    assertEquals(anchored.strategy, "context_score");
    assertEquals(anchored.start, actualBest.length);
  }
});

Deno.test("resolveAnchorPatch returns ambiguous when context is insufficient", () => {
  const submissionText = "bad bad dog";
  const patch = {
    before: "bad",
    after: null,
    contextBefore: "",
    contextAfter: "",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "ambiguous");
  if (result.status === "ambiguous") {
    assertEquals(result.strategy, "before_multiple");
    assertEquals(result.candidates, 2);
  }
});

Deno.test("resolveAnchorPatch returns ambiguous and caps candidates when before has too many candidates", () => {
  const submissionText = Array.from({ length: 60 }, () => "bad ").join("");
  const patch = {
    before: "bad",
    after: null,
    contextBefore: "",
    contextAfter: "",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "ambiguous");
  if (result.status === "ambiguous") {
    assertEquals(result.strategy, "before_multiple");
    assertEquals(
      result.candidates,
      DEFAULT_ANCHOR_RESOLVER_OPTIONS.maxCandidates + 1,
    );
  }
});

Deno.test("resolveAnchorPatch maps whitespace-normalized matches", () => {
  const submissionText = "Hello\nworld  again";
  const patch = {
    before: "world again",
    after: null,
    contextBefore: "",
    contextAfter: "",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "anchored");
  if (result.status !== "anchored") return;
  assertEquals(result.strategy, "whitespace");
  const expectedStart = submissionText.indexOf("world");
  const expectedText = "world  again";
  assertEquals(result.start, expectedStart);
  assertEquals(submissionText.slice(result.start, result.end), expectedText);
});

Deno.test("resolveAnchorPatch returns not_found when before is missing", () => {
  const submissionText = "Nothing to see here.";
  const patch = {
    before: "missing",
    after: null,
    contextBefore: "",
    contextAfter: "",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "not_found");
});

Deno.test("resolveAnchorPatch returns invalid when before is too short", () => {
  const submissionText = "Short text.";
  const patch = {
    before: "a",
    after: null,
    contextBefore: "",
    contextAfter: "",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "invalid");
  if (result.status === "invalid") {
    assertEquals(result.reason, "before_too_short");
  }
});

Deno.test("resolveAnchorPatch returns invalid when before is empty", () => {
  const submissionText = "Empty before.";
  const patch = {
    before: "",
    after: null,
    contextBefore: "",
    contextAfter: "",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "invalid");
  if (result.status === "invalid") {
    assertEquals(result.reason, "before_too_short");
  }
});

Deno.test("resolveAnchorPatch returns invalid when context exceeds maximum length", () => {
  const submissionText = "The quick brown fox jumps over the lazy dog.";
  const patch = {
    before: "brown",
    after: null,
    contextBefore: "x".repeat(41),
    contextAfter: "",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "invalid");
  if (result.status === "invalid") {
    assertEquals(result.reason, "context_too_long");
  }
});

Deno.test("resolveAnchorPatch returns invalid when after is too long", () => {
  const submissionText = "The quick brown fox jumps over the lazy dog.";
  const patch = {
    before: "brown",
    after: "x".repeat(121),
    contextBefore: "",
    contextAfter: "",
  };

  const result = resolveAnchorPatch(submissionText, patch);
  assertEquals(result.status, "invalid");
  if (result.status === "invalid") {
    assertEquals(result.reason, "after_too_long");
  }
});
