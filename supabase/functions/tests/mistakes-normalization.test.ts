import { assert, assertEquals, assertThrows } from "std/testing/asserts.ts";

import {
  type MistakeNormalizationContext,
  MistakeValidationError,
  normalizeMistakesPayload,
  SHORT_SUBMISSION_WORD_THRESHOLD,
  validateShortSubmissionMistakes,
} from "../_shared/mistakes.ts";

const categoriesByCode = new Map([
  ["GR", { id: 1, code: "GR" }],
  ["LX", { id: 2, code: "LX" }],
  ["TA", { id: 3, code: "TA" }],
  ["DC", { id: 4, code: "DC" }],
  ["ME", { id: 5, code: "ME" }],
]);

const tagsByCode = new Map([
  ["TENSE_ASPECT", { id: 101, code: "TENSE_ASPECT", category_id: 1 }],
  ["VERB_FORM", { id: 102, code: "VERB_FORM", category_id: 1 }],
  ["SVA", { id: 103, code: "SVA", category_id: 1 }],
  ["WORD_ORDER", { id: 104, code: "WORD_ORDER", category_id: 1 }],
  ["WORD_CHOICE", { id: 201, code: "WORD_CHOICE", category_id: 2 }],
  ["COLLOCATION", { id: 202, code: "COLLOCATION", category_id: 2 }],
  ["WORD_COUNT", { id: 301, code: "WORD_COUNT", category_id: 3 }],
  ["TASK_COVERAGE", { id: 302, code: "TASK_COVERAGE", category_id: 3 }],
  ["SENTENCE_BOUNDARY", { id: 401, code: "SENTENCE_BOUNDARY", category_id: 4 }],
  ["SPELLING", { id: 501, code: "SPELLING", category_id: 5 }],
]);

const baseContext: MistakeNormalizationContext = {
  submissionText: "ran jumped over log.",
  categoriesByCode,
  tagsByCode,
};

Deno.test("normalizeMistakesPayload promotes a tag that matches the resolved category", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT", "LX.WORD_CHOICE"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Verb tense mismatch.",
      },
    ],
  };

  const result = normalizeMistakesPayload(payload, baseContext);
  assertEquals(result.items.length, 1);
  const item = result.items[0];
  assertEquals(item.categoryCode, "LX");
  assertEquals(item.featureTags, ["WORD_CHOICE"]);
  assertEquals(item.primaryTagCode, "WORD_CHOICE");
  assertEquals(item.primaryTagId, 201);
  assertEquals(item.meta.feature_tags, ["WORD_CHOICE"]);
  assertEquals(item.meta.truncated_feature_tags, ["TENSE_ASPECT"]);
  const notes = item.meta.normalization_notes as string[];
  assert(notes.includes("override:LX"));
  assert(notes.includes("primary_promoted:WORD_CHOICE"));
  assert(notes.includes("mismatched_feature_tag_omitted:TENSE_ASPECT"));
});

Deno.test("normalizeMistakesPayload summary excludes mismatched tags", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT", "LX.WORD_CHOICE"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Verb tense mismatch.",
      },
    ],
  };

  const result = normalizeMistakesPayload(payload, baseContext);
  assertEquals(result.summary.byCategory, { LX: 1 });
  assertEquals(result.summary.byTag, { WORD_CHOICE: 1 });
});

Deno.test("normalizeMistakesPayload rejects zero-length spans", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT"],
        anchorText: "tense",
        anchorStart: 5,
        anchorEnd: 5,
        explanation: "Zero length should not be allowed.",
      },
    ],
  };

  assertThrows(
    () => {
      normalizeMistakesPayload(payload, baseContext);
    },
    MistakeValidationError,
    "anchorStart must be >= 0 and anchorEnd must be greater than anchorStart.",
  );
});

Deno.test("normalizeMistakesPayload keeps the most actionable correction after dedupe", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation:
          "Existing explanation is intentionally longer to ensure it wins during merge.",
        suggestedTag: "VERB_FORM",
      },
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Short.",
        suggestedCorrection: "Use 'run' instead of 'ran'.",
      },
    ],
  };

  const result = normalizeMistakesPayload(payload, baseContext);
  assertEquals(result.items.length, 1);
  const item = result.items[0];
  assertEquals(item.suggestedCorrection, "Use 'run' instead of 'ran'.");
});

Deno.test("normalizeMistakesPayload retains a previously suggestedTag when the winning duplicate lacks one", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Short explanation.",
        suggestedTag: "VERB_FORM",
      },
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation:
          "This explanation is considerably longer and should take precedence over the other candidate because it provides richer detail about the error and recommended fix.",
      },
    ],
  };

  const result = normalizeMistakesPayload(payload, baseContext);
  assertEquals(result.items.length, 1);
  const [item] = result.items;
  assertEquals(
    item.explanation,
    "This explanation is considerably longer and should take precedence over the other candidate because it provides richer detail about the error and recommended fix.",
  );
  assertEquals(item.suggestedTag, "VERB_FORM");
  assertEquals(item.meta.suggested_tag, "VERB_FORM");
});

Deno.test("normalizeMistakesPayload rejects non-string suggestedCorrection values", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Object suggested corrections should be rejected.",
        suggestedCorrection: { value: "Use 'run' instead of 'ran'." },
      },
    ],
  };

  assertThrows(
    () => {
      normalizeMistakesPayload(payload, baseContext);
    },
    MistakeValidationError,
    "suggestedCorrection must be a string when provided.",
  );
});

Deno.test("normalizeMistakesPayload promotes feature tags from extras when needed", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: [
          "GR.TENSE_ASPECT",
          "GR.VERB_FORM",
          "LX.WORD_CHOICE",
          "LX.COLLOCATION",
        ],
        anchorText: "jumped",
        anchorStart: 4,
        anchorEnd: 10,
        explanation: "Incorrect lexical choice.",
      },
    ],
  };

  const result = normalizeMistakesPayload(payload, baseContext);
  assertEquals(result.items.length, 1);
  const item = result.items[0];
  assertEquals(item.categoryCode, "LX");
  assertEquals(item.featureTags, ["WORD_CHOICE", "COLLOCATION"]);
  assertEquals(item.primaryTagCode, "WORD_CHOICE");
  assertEquals(item.primaryTagId, 201);
  assertEquals(item.meta.feature_tags, ["WORD_CHOICE", "COLLOCATION"]);
  assertEquals(item.meta.truncated_feature_tags, ["TENSE_ASPECT", "VERB_FORM"]);
  const notes = item.meta.normalization_notes as string[];
  assert(notes.includes("override:LX"));
  assert(notes.includes("primary_promoted_from_extra"));
  assert(notes.includes("mismatched_feature_tag_omitted:TENSE_ASPECT"));
  assert(notes.includes("mismatched_feature_tag_omitted:VERB_FORM"));
});

Deno.test("normalizeMistakesPayload rejects anchorText mismatches against submission spans", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT"],
        anchorText: "fox",
        anchorStart: 0,
        anchorEnd: 3,
        explanation:
          "Should be rejected because it does not match the submission slice.",
      },
    ],
  };

  assertThrows(
    () => {
      normalizeMistakesPayload(payload, baseContext);
    },
    MistakeValidationError,
    "anchorText must match the referenced submission span.",
  );
});

Deno.test("normalizeMistakesPayload accepts whitespace-normalized anchor matches", () => {
  const submissionText = "Alpha\n  beta gamma.";
  const rawSpan = "Alpha\n  beta";
  const anchorStart = submissionText.indexOf("Alpha");
  const anchorEnd = anchorStart + rawSpan.length;

  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["GR.TENSE_ASPECT"],
        anchorText: "Alpha beta",
        anchorStart,
        anchorEnd,
        explanation: "Whitespace differences should normalize correctly.",
      },
    ],
  };

  const context: MistakeNormalizationContext = {
    ...baseContext,
    submissionText,
  };

  const result = normalizeMistakesPayload(payload, context);
  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].anchorText, rawSpan);
});

Deno.test("validateShortSubmissionMistakes allows TA word count items under the threshold", () => {
  const payload = {
    items: [
      {
        category: "TA",
        featureTags: ["TA.WORD_COUNT"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Submission is under the minimum word count.",
      },
    ],
  };

  const normalized = normalizeMistakesPayload(payload, baseContext);
  const validation = validateShortSubmissionMistakes(
    normalized.items,
    SHORT_SUBMISSION_WORD_THRESHOLD - 5,
  );

  assert(validation.ok);
  assertEquals(validation.offendingItems.length, 0);
});

Deno.test("validateShortSubmissionMistakes allows emergency grammar findings under the threshold", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["GR.VERB_FORM"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Verb form should be surfaced even for short submissions.",
      },
    ],
  };

  const normalized = normalizeMistakesPayload(payload, baseContext);
  const validation = validateShortSubmissionMistakes(
    normalized.items,
    SHORT_SUBMISSION_WORD_THRESHOLD - 1,
  );

  assert(validation.ok);
  assertEquals(validation.offendingItems.length, 0);
});

Deno.test("validateShortSubmissionMistakes allows emergency lexical blockers under the threshold", () => {
  const payload = {
    items: [
      {
        category: "LX",
        featureTags: ["LX.WORD_CHOICE"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation:
          "Word choice can block understanding and should be retained.",
      },
    ],
  };

  const normalized = normalizeMistakesPayload(payload, baseContext);
  const validation = validateShortSubmissionMistakes(
    normalized.items,
    SHORT_SUBMISSION_WORD_THRESHOLD - 1,
  );

  assert(validation.ok);
  assertEquals(validation.offendingItems.length, 0);
});

Deno.test("validateShortSubmissionMistakes rejects items without feature tags under the threshold", () => {
  const payload = {
    items: [
      {
        category: "GR",
        featureTags: [],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Missing feature tags should fail validation.",
      },
    ],
  };

  const normalized = normalizeMistakesPayload(payload, baseContext);
  const validation = validateShortSubmissionMistakes(
    normalized.items,
    SHORT_SUBMISSION_WORD_THRESHOLD - 2,
  );

  assertEquals(validation.ok, false);
  assertEquals(validation.offendingItems.length, 1);
});

Deno.test("validateShortSubmissionMistakes rejects TA items without word count tag", () => {
  const payload = {
    items: [
      {
        category: "TA",
        featureTags: ["TA.TASK_COVERAGE"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Missing TA.WORD_COUNT should block short submissions.",
      },
    ],
  };

  const normalized = normalizeMistakesPayload(payload, baseContext);
  const validation = validateShortSubmissionMistakes(
    normalized.items,
    SHORT_SUBMISSION_WORD_THRESHOLD - 3,
  );

  assertEquals(validation.ok, false);
  assertEquals(validation.offendingItems.length, 1);
  assertEquals(validation.offendingItems[0].categoryCode, "TA");
});

Deno.test("validateShortSubmissionMistakes rejects TA items that include additional tags", () => {
  const payload = {
    items: [
      {
        category: "TA",
        featureTags: ["TA.WORD_COUNT", "TA.TASK_COVERAGE"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Extra TA tags should be rejected for short submissions.",
      },
    ],
  };

  const normalized = normalizeMistakesPayload(payload, baseContext);
  const validation = validateShortSubmissionMistakes(
    normalized.items,
    SHORT_SUBMISSION_WORD_THRESHOLD - 4,
  );

  assertEquals(validation.ok, false);
  assertEquals(validation.offendingItems.length, 1);
  assertEquals(validation.offendingItems[0].categoryCode, "TA");
});

Deno.test("validateShortSubmissionMistakes rejects categories outside the emergency set", () => {
  const payload = {
    items: [
      {
        category: "ME",
        featureTags: ["ME.SPELLING"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation:
          "Non-emergency categories should be dropped for short submissions.",
      },
    ],
  };

  const normalized = normalizeMistakesPayload(payload, baseContext);
  const validation = validateShortSubmissionMistakes(
    normalized.items,
    SHORT_SUBMISSION_WORD_THRESHOLD - 1,
  );

  assertEquals(validation.ok, false);
  assertEquals(validation.offendingItems.length, 1);
  assertEquals(validation.offendingItems[0].categoryCode, "ME");
});

Deno.test("validateShortSubmissionMistakes rejects disallowed tags within emergency categories", () => {
  const payload = {
    items: [
      {
        category: "LX",
        featureTags: ["LX.COLLOCATION"],
        anchorText: "ran",
        anchorStart: 0,
        anchorEnd: 3,
        explanation: "Only the emergency lexical tags are allowed.",
      },
    ],
  };

  const normalized = normalizeMistakesPayload(payload, baseContext);
  const validation = validateShortSubmissionMistakes(
    normalized.items,
    SHORT_SUBMISSION_WORD_THRESHOLD - 1,
  );

  assertEquals(validation.ok, false);
  assertEquals(validation.offendingItems.length, 1);
  assertEquals(validation.offendingItems[0].categoryCode, "LX");
});
