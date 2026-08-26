import { assertEquals } from "std/testing/asserts.ts";

import { validateAiResponseRootKeys } from "../evaluate-submission/ai-response-root-keys.ts";
import { evaluationSchema } from "../evaluate-submission/mistakes-v2.schema.ts";

Deno.test("validateAiResponseRootKeys tolerates unexpected root keys when required keys exist", () => {
  const result = validateAiResponseRootKeys(
    {
      evaluation: {},
      mistakes: {},
      debug: { foo: 1 },
    },
    ["evaluation", "mistakes"],
  );

  assertEquals(result.ok, true);
  assertEquals(result.missing, []);
  assertEquals(result.unexpected, ["debug"]);
});

Deno.test("validateAiResponseRootKeys fails when required root keys are missing", () => {
  const result = validateAiResponseRootKeys(
    {
      mistakes: {},
      debug: { foo: 1 },
    },
    ["evaluation", "mistakes"],
  );

  assertEquals(result.ok, false);
  assertEquals(result.missing, ["evaluation"]);
  assertEquals(result.unexpected, ["debug"]);
});

Deno.test("evaluationSchema rejects invalid evaluation payloads", () => {
  const result = evaluationSchema.safeParse({
    overallScore: "3/5",
    criteriaEvaluation: [],
    overallCommentary: 123,
  });

  assertEquals(result.success, false);
});
