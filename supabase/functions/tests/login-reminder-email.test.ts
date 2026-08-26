import { assert, assertEquals } from "std/testing/asserts.ts";

import { buildLoginReminderTemplate } from "../_shared/templates/login-reminder.ts";
import { sendLoginReminderEmail } from "../_shared/send-login-reminder-email.ts";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

Deno.test("buildLoginReminderTemplate falls back to default values", () => {
  const template = buildLoginReminderTemplate({
    academyName: "",
    authUrl: null,
  });
  assertEquals(template.ctaUrl, "http://127.0.0.1:8080/auth");
  assert(template.subject.toLowerCase().includes("exameny"));
  assert(template.html.includes("Google"));
  assert(template.text.includes("/auth"));
});

Deno.test("sendLoginReminderEmail delegates to transactional sender with template content", async () => {
  const calls: Array<unknown> = [];
  await sendLoginReminderEmail(
    {
      to: "member@example.com",
      academyName: "Academia Demo",
      authUrl: "https://example.com/auth?academy_id=7",
      requestId: "req-abc",
      idempotencyKey: "custom-key",
      tags: [{ name: "source", value: "test" }],
    },
    {
      sendEmail: (payload) => {
        calls.push(payload);
        return Promise.resolve();
      },
    },
  );

  assertEquals(calls.length, 1);
  const payload = calls[0];
  if (!isPlainRecord(payload)) {
    throw new Error("Expected email payload to be an object");
  }
  assertEquals(payload.to, "member@example.com");
  assertEquals(payload.requestId, "req-abc");
  assertEquals(payload.idempotencyKey, "custom-key");
  assertEquals(payload.tags, [{ name: "source", value: "test" }]);
  assert(
    typeof payload.subject === "string" &&
      payload.subject.includes("Academia Demo"),
  );
  assert(typeof payload.html === "string" && payload.html.includes("Google"));
  assert(typeof payload.text === "string" && payload.text.includes("/auth"));
});
