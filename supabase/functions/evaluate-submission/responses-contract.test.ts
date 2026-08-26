import { assertEquals, assertThrows } from "std/testing/asserts.ts";

import {
  EVALUATION_RESPONSES_JSON_SCHEMA,
  HARNESS_RESPONSES_JSON_SCHEMA,
  parseEvaluationResponsesPayload,
  parseHarnessResponsesPayload,
  parseRealignResponsesPayload,
  REALIGN_RESPONSES_JSON_SCHEMA,
} from "./responses-contract.ts";

const validMistake = {
  category: "GR",
  featureTags: ["ARTICLE"],
  anchorPatch: {
    before: "the example",
    after: "an example",
    contextBefore: "This is ",
    contextAfter: ".",
  },
  explanation: "Use the indefinite article for a first mention.",
  suggestedTag: null,
};

Deno.test("evaluation Responses parser accepts the strict public contract", () => {
  const parsed = parseEvaluationResponsesPayload({
    evaluation: {
      overallScore: "4/5",
      criteriaEvaluation: [{
        criterionName: "Communicative achievement",
        score: "4/5",
        feedback: "The response addresses the requested audience.",
      }],
      overallCommentary: "The response is clear and mostly accurate.",
    },
    mistakes: { items: [validMistake] },
  });

  assertEquals(parsed.mistakes.items.length, 1);
  assertEquals(parsed.mistakes.items[0].anchorPatch.before, "the example");
});

Deno.test("evaluation Responses parser rejects optional-looking missing fields", () => {
  const invalidMistake = {
    ...validMistake,
    anchorPatch: {
      before: validMistake.anchorPatch.before,
      after: validMistake.anchorPatch.after,
    },
  };

  assertThrows(() =>
    parseEvaluationResponsesPayload({
      evaluation: {
        overallScore: "4/5",
        criteriaEvaluation: [],
        overallCommentary: "Clear response.",
      },
      mistakes: { items: [invalidMistake] },
    })
  );
});

Deno.test("evaluation Responses parser rejects unexpected output fields", () => {
  assertThrows(() =>
    parseEvaluationResponsesPayload({
      evaluation: {
        overallScore: "4/5",
        criteriaEvaluation: [],
        overallCommentary: "Clear response.",
      },
      mistakes: { items: [] },
      hiddenReasoning: "must not be accepted",
    })
  );
});

Deno.test("harness reuses the exact strict mistake item contract", () => {
  const parsed = parseHarnessResponsesPayload({ items: [validMistake] });
  assertEquals(parsed.items.length, 1);
  assertEquals(parsed.items[0].category, "GR");
  assertEquals(parsed.items[0].anchorPatch, validMistake.anchorPatch);

  assertThrows(() =>
    parseHarnessResponsesPayload({
      items: [{ ...validMistake, anchorStart: 4 }],
    })
  );
});

Deno.test("realign parser requires the top-level items object", () => {
  assertThrows(() =>
    parseRealignResponsesPayload([
      {
        id: "mistake_0",
        status: "aligned",
        anchorStart: 2,
        anchorEnd: 5,
        matchedText: "can",
        notes: null,
      },
    ])
  );

  const parsed = parseRealignResponsesPayload({
    items: [{
      id: "mistake_0",
      status: "aligned",
      anchorStart: 2,
      anchorEnd: 5,
      matchedText: "can",
      notes: null,
    }],
  });
  assertEquals(parsed.items.length, 1);
});

Deno.test("all Structured Outputs schemas are strict at every object node", () => {
  for (
    const schema of [
      EVALUATION_RESPONSES_JSON_SCHEMA,
      HARNESS_RESPONSES_JSON_SCHEMA,
      REALIGN_RESPONSES_JSON_SCHEMA,
    ]
  ) {
    assertStrictObjectNodes(schema);
  }
});

function assertStrictObjectNodes(node: unknown): void {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return;
  const record = node as Record<string, unknown>;
  if (record.type === "object") {
    assertEquals(record.additionalProperties, false);
    const properties = record.properties as Record<string, unknown>;
    const required = record.required as string[];
    assertEquals([...required].sort(), Object.keys(properties).sort());
    for (const child of Object.values(properties)) {
      assertStrictObjectNodes(child);
    }
  }
  if (record.type === "array") assertStrictObjectNodes(record.items);
  for (const keyword of ["anyOf", "oneOf", "allOf"]) {
    const variants = record[keyword];
    if (Array.isArray(variants)) {
      for (const variant of variants) assertStrictObjectNodes(variant);
    }
  }
}
