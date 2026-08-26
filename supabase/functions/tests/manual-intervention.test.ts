import { assert, assertEquals } from "std/testing/asserts.ts";

import { tryBuildManualInterventionResponse } from "../_shared/manual-intervention.ts";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJsonRecord = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  const payload = await response.json();
  if (!isPlainRecord(payload)) {
    throw new Error("Expected JSON payload to be an object");
  }
  return payload;
};

Deno.test("tryBuildManualInterventionResponse returns parsed RPC payload", async () => {
  const response = tryBuildManualInterventionResponse(
    {
      message: "MANUAL_INTERVENTION_REQUIRED",
      details: '{"blocked_prompt_ids":[1,2]}',
    },
    "req-manual",
    { "Content-Type": "application/json" },
  );

  assert(response);

  const body = await readJsonRecord(response);
  assertEquals(body.request_id, "req-manual");
  assertEquals(body.blocked_prompt_ids, [1, 2]);
});

Deno.test("tryBuildManualInterventionResponse falls back to detail string when JSON parsing fails", async () => {
  const response = tryBuildManualInterventionResponse(
    {
      message: "MANUAL_INTERVENTION_REQUIRED",
      details: "blocked_prompt_ids={1,2}",
      hint: "check prompts",
    },
    "req-manual-2",
    { "Content-Type": "application/json" },
  );

  assert(response);

  const body = await readJsonRecord(response);
  assertEquals(body.request_id, "req-manual-2");
  assertEquals(body.code, "MANUAL_INTERVENTION_REQUIRED");
  assertEquals(body.details, null);
  assertEquals(body.hint, undefined);
});

Deno.test("tryBuildManualInterventionResponse merges additional payload metadata", async () => {
  const response = tryBuildManualInterventionResponse(
    {
      message: "MANUAL_INTERVENTION_REQUIRED",
      details: { code: "MANUAL_INTERVENTION_REQUIRED" },
    },
    "req-manual-3",
    { "Content-Type": "application/json" },
    { emails_total: 2, emails_created: 1 },
  );

  assert(response);

  const body = await readJsonRecord(response);
  assertEquals(body.request_id, "req-manual-3");
  assertEquals(body.emails_total, 2);
  assertEquals(body.emails_created, 1);
  assertEquals(body.code, "MANUAL_INTERVENTION_REQUIRED");
});

Deno.test("tryBuildManualInterventionResponse does not allow overriding request_id", async () => {
  const response = tryBuildManualInterventionResponse(
    {
      message: "MANUAL_INTERVENTION_REQUIRED",
      details: { request_id: "evil", code: "MANUAL_INTERVENTION_REQUIRED" },
    },
    "req-manual-4",
    { "Content-Type": "application/json" },
  );

  assert(response);

  const body = await readJsonRecord(response);
  assertEquals(body.request_id, "req-manual-4");
  assertEquals(body.code, "MANUAL_INTERVENTION_REQUIRED");
});
