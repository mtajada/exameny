import { assert, assertEquals, assertThrows } from "std/testing/asserts.ts";

import {
  type NormalizedMistakeV2Item,
  normalizeMistakesPayloadV2,
} from "../_shared/mistakes-v2.ts";
import { MistakeValidationError } from "../_shared/mistakes.ts";

function createContext(submissionText: string) {
  const categories = [
    { id: 1, code: "GR" },
    { id: 2, code: "LX" },
    { id: 3, code: "ME" },
    { id: 4, code: "DC" },
  ];
  const tags = [
    { id: 101, code: "TENSE_ASPECT", category_id: 1 },
    { id: 102, code: "WORD_CHOICE", category_id: 2 },
    { id: 103, code: "SPELLING", category_id: 3 },
    { id: 104, code: "SENTENCE_BOUNDARY", category_id: 4 },
  ];

  return {
    submissionText,
    categoriesByCode: new Map(
      categories.map((category) => [category.code, category]),
    ),
    tagsByCode: new Map(tags.map((tag) => [tag.code, tag])),
  };
}

function countByStatus(items: NormalizedMistakeV2Item[]) {
  return items.reduce((acc, item) => {
    acc[item.anchorResolution.status] += 1;
    return acc;
  }, { anchored: 0, ambiguous: 0, not_found: 0, invalid: 0 });
}

function buildSummaryFromItems(items: NormalizedMistakeV2Item[]) {
  const byCategory: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    for (const tag of item.featureTags) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }

  return { byCategory, byTag };
}

function assertAnchoredSpan(
  item: NormalizedMistakeV2Item,
  submissionText: string,
) {
  assertEquals(item.anchorResolution.status, "anchored");
  if (item.anchorResolution.status !== "anchored") return;
  const { start, end } = item.anchorResolution;
  assert(start >= 0 && end > start && end <= submissionText.length);
  assertEquals(submissionText.slice(start, end), item.anchorPatch.before);
}

Deno.test("normalizeMistakesPayloadV2 truncates overlong context strings instead of discarding the item", () => {
  const submissionText = [
    "This is a deliberately long context prefix that exceeds forty chars. Touching the history allows researchers to connect with the past in a way that is impossible digitally.",
  ].join("\n");

  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["TENSE_ASPECT"],
        anchorPatch: {
          before: "Touching the history",
          after: "Handling original documents",
          contextBefore:
            "This is a deliberately long context prefix that exceeds forty chars. ",
          contextAfter:
            " allows researchers to connect with the past in a way that is impossible digitally.",
        },
        explanation: "Truncation test for long context fields.",
        suggestedTag: null,
      },
    ],
  };

  const result = normalizeMistakesPayloadV2(
    payload,
    createContext(submissionText),
  );
  assertEquals(result.items.length, 1);

  const item = result.items[0]!;
  assertEquals(item.anchorPatch.before, "Touching the history");
  assert((item.anchorPatch.contextBefore ?? "").length <= 40);
  assert((item.anchorPatch.contextAfter ?? "").length <= 40);
  assert(item.meta.normalization_notes);
  assert(Array.isArray(item.meta.normalization_notes));
  assert(
    (item.meta.normalization_notes as string[]).includes(
      "context_before_truncated",
    ),
  );
  assert(
    (item.meta.normalization_notes as string[]).includes(
      "context_after_truncated",
    ),
  );
  assertAnchoredSpan(item, submissionText);
});

Deno.test("normalizeMistakesPayloadV2 keeps partial results when some items fail", () => {
  const submissionText = [
    "I go to school every day.",
    "I go to school every night.",
    "She walks to the park.",
    "They are happy today.",
  ].join("\n");

  const payload = {
    items: [
      {
        category: "GR",
        featureTags: ["TENSE_ASPECT"],
        anchorPatch: {
          before: "go to school",
          after: "goes to school",
          contextBefore: "I ",
          contextAfter: " every day.",
        },
        explanation: "Verb tense mismatch.",
        suggestedTag: null,
      },
      {
        category: "GR",
        featureTags: ["TENSE_ASPECT"],
        anchorPatch: {
          before: "go to school",
          after: "goes to school",
          contextBefore: "I ",
          contextAfter: " every night.",
        },
        explanation: "Verb tense mismatch again.",
        suggestedTag: null,
      },
      {
        category: "LX",
        featureTags: ["WORD_CHOICE"],
        anchorPatch: {
          before: "go to school",
          after: null,
          contextBefore: "",
          contextAfter: "",
        },
        explanation: "Word choice unclear.",
        suggestedTag: null,
      },
      {
        category: "ME",
        featureTags: ["SPELLING"],
        anchorPatch: {
          before: "missing phrase",
          after: null,
          contextBefore: "",
          contextAfter: "",
        },
        explanation: "Missing text.",
        suggestedTag: null,
      },
      {
        category: "GR",
        featureTags: ["TENSE_ASPECT"],
        anchorPatch: {
          before: "walks",
          after: "walk",
          contextBefore: "She ",
          contextAfter: " to the park.",
        },
        explanation: "Subject-verb agreement.",
        suggestedTag: null,
      },
      {
        category: "GR",
        featureTags: ["TENSE_ASPECT"],
        anchorPatch: {
          before: "happy today",
          after: null,
          contextBefore: "are ",
          contextAfter: ".",
        },
        explanation: "Adjective use.",
        suggestedTag: null,
      },
      {
        category: "GR",
        featureTags: ["TENSE_ASPECT"],
        anchorPatch: {
          before: "go to school",
          after: "goes to school",
          contextBefore: "I ",
          contextAfter: " every day",
        },
        explanation: "Duplicate span should merge.",
        suggestedTag: null,
      },
      {
        category: "LX",
        featureTags: ["WORD_CHOICE"],
        anchorPatch: {
          before: "go",
          after: null,
          contextBefore: "",
          contextAfter: "",
        },
        explanation: "Too short before should be invalid.",
        suggestedTag: null,
      },
      {
        category: "ME",
        featureTags: ["SPELLING"],
        anchorPatch: {
          before: "school tomorrow",
          after: null,
          contextBefore: "",
          contextAfter: "",
        },
        explanation: "Not present in text.",
        suggestedTag: null,
      },
      {
        category: "DC",
        featureTags: ["SENTENCE_BOUNDARY"],
        anchorPatch: {
          before: "school every night",
          after: null,
          contextBefore: "to ",
          contextAfter: ".",
        },
        explanation: "Sentence boundary issue.",
        suggestedTag: null,
      },
    ],
  };

  const result = normalizeMistakesPayloadV2(
    payload,
    createContext(submissionText),
  );
  assert(result.items.length > 0);
  assertEquals(result.items.length, 8);

  const counts = countByStatus(result.items);
  assertEquals(counts.anchored, 5);
  assertEquals(counts.ambiguous, 1);
  assertEquals(counts.not_found, 2);
  assertEquals(counts.invalid, 0);
  assertEquals(result.metrics.invalid, 1);
  assertEquals(
    result.metrics.total,
    result.items.length + result.metrics.invalid,
  );

  const mergedItem = result.items.find((item) =>
    item.anchorPatch.before === "go to school" &&
    item.anchorPatch.contextAfter === " every day."
  );
  assert(mergedItem);
  assertEquals(mergedItem.meta.repeat_count, 2);
  assertAnchoredSpan(mergedItem, submissionText);

  const happyItem = result.items.find((item) =>
    item.anchorPatch.before === "happy today" &&
    item.anchorPatch.contextBefore === "are " &&
    item.anchorPatch.contextAfter === "."
  );
  assert(happyItem);
  assertAnchoredSpan(happyItem, submissionText);

  assertEquals(result.summary, buildSummaryFromItems(result.items));
});

Deno.test("normalizeMistakesPayloadV2 tolerates missing suggestedTag and extra keys", () => {
  const submissionText = "I go to school every day.";

  const result = normalizeMistakesPayloadV2(
    {
      items: [
        {
          category: "MECHANICS",
          featureTags: "SPELLING",
          anchorPatch: {
            before: "go to school",
            after: null,
            contextBefore: "I ",
            contextAfter: " every day.",
          },
          explanation: "Test case without suggestedTag.",
          anchorText: "go to school",
          anchorStart: 2,
          anchorEnd: 14,
          suggestedCorrection: "goes to school",
        },
      ],
    },
    createContext(submissionText),
  );

  assertEquals(result.items.length, 1);
  assertEquals(result.metrics.invalid, 0);
  assertEquals(result.metrics.total, 1);
  assertAnchoredSpan(result.items[0]!, submissionText);
});

Deno.test("normalizeMistakesPayloadV2 falls back to legacy offsets when anchorPatch is missing", () => {
  const submissionText = "I go to school every day.";

  const result = normalizeMistakesPayloadV2(
    {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorText: "go to school",
          anchorStart: 2,
          anchorEnd: 14,
          suggestedCorrection: "goes to school",
          explanation: "Legacy offsets payload.",
          suggestedTag: null,
        },
      ],
    },
    createContext(submissionText),
  );

  assertEquals(result.items.length, 1);
  assertEquals(result.items[0]?.anchorResolution.status, "anchored");
  if (result.items[0]?.anchorResolution.status === "anchored") {
    assertEquals(result.items[0].anchorResolution.strategy, "legacy_offsets");
  }
  assertAnchoredSpan(result.items[0]!, submissionText);
});

Deno.test("normalizeMistakesPayloadV2 rejects mistakes payload without items", () => {
  const context = createContext("I go to school every day.");

  assertThrows(
    () =>
      normalizeMistakesPayloadV2(
        { summary: { byCategory: {}, byTag: {} } },
        context,
      ),
    MistakeValidationError,
  );
});

Deno.test("normalizeMistakesPayloadV2 rejects mistakes.items that is not an array", () => {
  const context = createContext("I go to school every day.");

  assertThrows(
    () => normalizeMistakesPayloadV2({ items: "not-an-array" }, context),
    MistakeValidationError,
  );
});

Deno.test("normalizeMistakesPayloadV2 accepts an explicit empty items array", () => {
  const context = createContext("I go to school every day.");

  const result = normalizeMistakesPayloadV2({ items: [] }, context);
  assertEquals(result.items.length, 0);
  assertEquals(result.metrics.total, 0);
  assertEquals(result.metrics.invalid, 0);
});

Deno.test("normalizeMistakesPayloadV2 keeps pipeline completed when 100% items are invalid", () => {
  const context = createContext("I go to school every day.");

  const result = normalizeMistakesPayloadV2(
    {
      items: [
        { category: "GR" },
        { category: "LX", featureTags: [] },
      ],
    },
    context,
  );

  assertEquals(result.items.length, 0);
  assertEquals(result.metrics.total, 2);
  assertEquals(result.metrics.invalid, 2);
});
