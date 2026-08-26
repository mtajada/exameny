import { assert, assertEquals } from "std/testing/asserts.ts";

import { mistakesV2Schema } from "../evaluate-submission/mistakes-v2.schema.ts";

function buildPayload(overrides: Record<string, unknown>) {
  return {
    evaluation: {
      overallScore: "3/5",
      criteriaEvaluation: [
        { criterionName: "Grammar", score: "3/5", feedback: "Solid overall." },
      ],
      overallCommentary: "Good work with minor issues.",
    },
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorPatch: {
            before: "is go",
            after: "is going",
            contextBefore: "She ",
            contextAfter: " to school",
          },
          explanation: "Verb tense mismatch.",
          suggestedTag: null,
        },
      ],
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
    ...overrides,
  };
}

Deno.test("mistakesV2Schema accepts a valid payload", () => {
  const payload = buildPayload({});

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("mistakesV2Schema accepts missing context fields in anchorPatch", () => {
  const payload = buildPayload({
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorPatch: {
            before: "is go",
            after: "is going",
          },
          explanation: "Verb tense mismatch.",
          suggestedTag: null,
        },
      ],
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("mistakesV2Schema accepts more than two feature tags", () => {
  const payload = buildPayload({
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT", "VERB_FORM", "ARTICLE"],
          anchorPatch: {
            before: "is go",
            after: "is going",
          },
          explanation: "Verb tense mismatch.",
          suggestedTag: null,
        },
      ],
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1, VERB_FORM: 1, ARTICLE: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("mistakesV2Schema rejects missing suggestedTag", () => {
  const payload = buildPayload({
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorPatch: {
            before: "is go",
            after: "is going",
          },
          explanation: "Missing suggestedTag.",
        },
      ],
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, false);
  assert(!result.success);
});

Deno.test("mistakesV2Schema rejects invalid anchorPatch.before", () => {
  const payload = buildPayload({
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorPatch: {
            before: "hi",
            after: null,
            contextBefore: "",
            contextAfter: "",
          },
          explanation: "Too short before.",
          suggestedTag: null,
        },
      ],
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, false);
  assert(!result.success);
});

Deno.test("mistakesV2Schema rejects anchorPatch.before that is only whitespace", () => {
  const payload = buildPayload({
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorPatch: {
            before: "   ",
            after: null,
            contextBefore: "",
            contextAfter: "",
          },
          explanation: "Whitespace-only before.",
          suggestedTag: null,
        },
      ],
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, false);
  assert(!result.success);
});

Deno.test("mistakesV2Schema rejects anchorPatch.before longer than 120 characters", () => {
  const payload = buildPayload({
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorPatch: {
            before: "x".repeat(121),
            after: null,
            contextBefore: "",
            contextAfter: "",
          },
          explanation: "Too long before.",
          suggestedTag: null,
        },
      ],
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, false);
  assert(!result.success);
});

Deno.test("mistakesV2Schema rejects anchorPatch.after longer than 120 characters", () => {
  const payload = buildPayload({
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorPatch: {
            before: "is go",
            after: "x".repeat(121),
            contextBefore: "",
            contextAfter: "",
          },
          explanation: "Too long after.",
          suggestedTag: null,
        },
      ],
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, false);
  assert(!result.success);
});

Deno.test("mistakesV2Schema rejects context fields longer than 40 characters", () => {
  const payload = buildPayload({
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorPatch: {
            before: "is go",
            after: null,
            contextBefore: "x".repeat(41),
            contextAfter: "",
          },
          explanation: "Too long context.",
          suggestedTag: null,
        },
      ],
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, false);
  assert(!result.success);
});

Deno.test("mistakesV2Schema rejects mistakes payload missing items", () => {
  const payload = buildPayload({
    mistakes: {
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, false);
  assert(!result.success);
});

Deno.test("mistakesV2Schema rejects mistakes.items that is not an array", () => {
  const payload = buildPayload({
    mistakes: {
      items: "not-an-array",
      summary: {
        byCategory: { GR: 1 },
        byTag: { TENSE_ASPECT: 1 },
      },
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, false);
  assert(!result.success);
});

Deno.test("mistakesV2Schema rejects missing summary", () => {
  const payload = buildPayload({
    mistakes: {
      items: [
        {
          category: "GR",
          featureTags: ["TENSE_ASPECT"],
          anchorPatch: {
            before: "is go",
            after: "is going",
          },
          explanation: "Missing summary.",
          suggestedTag: null,
        },
      ],
    },
  });

  const result = mistakesV2Schema.safeParse(payload);
  assertEquals(result.success, false);
  assert(!result.success);
});
