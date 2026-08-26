import { assertEquals, assertRejects } from "std/testing/asserts.ts";

import { HttpError } from "../_shared/http-errors.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";

const withEnv = async (
  updates: Record<string, string | null | undefined>,
  run: () => Promise<void> | void,
) => {
  const previous = new Map<string, string | undefined>();
  Object.keys(updates).forEach((key) => {
    previous.set(key, Deno.env.get(key));
  });

  try {
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    });
    await run();
  } finally {
    previous.forEach((value, key) => {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    });
  }
};

Deno.test("sendTransactionalEmail posts Resend payload with idempotency + tags", async () => {
  await withEnv(
    {
      RESEND_API_URL: "https://api.resend.test/emails",
      RESEND_API_KEY: "re_test_key",
      RESEND_FROM_EMAIL: "invites@example.com",
      EMAIL_PROVIDER_MAX_ATTEMPTS: "1",
      EMAIL_PROVIDER_BACKOFF_MS: "1",
    },
    async () => {
      const calls: Array<{ url: string; init: RequestInit; body: unknown }> =
        [];

      await sendTransactionalEmail(
        {
          to: "member@example.com",
          subject: "Subject",
          html: "<p>Hello</p>",
          text: "Hello",
          requestId: "req-123",
          idempotencyKey: "idem-abc",
          tags: [
            { name: "academy_id", value: "7" },
            // these should be filtered out by sanitizeTags
            { name: "", value: "noop" },
            { name: "empty-value", value: "" },
          ],
        },
        {
          fetchImpl: (url, init) => {
            const body = init?.body ? JSON.parse(String(init.body)) : null;
            calls.push({ url: String(url), init: init ?? {}, body });
            return Promise.resolve(new Response("{}", { status: 200 }));
          },
          sleep: () => Promise.resolve(),
          now: () => 0,
        },
      );

      assertEquals(calls.length, 1);
      assertEquals(calls[0]?.url, "https://api.resend.test/emails");

      const headers = new Headers(calls[0]?.init.headers);
      assertEquals(headers.get("Authorization"), "Bearer re_test_key");
      assertEquals(headers.get("Content-Type"), "application/json");
      assertEquals(headers.get("Idempotency-Key"), "idem-abc");
      assertEquals(headers.get("X-Request-Id"), "req-123");

      assertEquals(calls[0]?.body, {
        from: "invites@example.com",
        to: ["member@example.com"],
        subject: "Subject",
        html: "<p>Hello</p>",
        text: "Hello",
        tags: [{ name: "academy_id", value: "7" }],
      });
    },
  );
});

Deno.test("sendTransactionalEmail retries with deterministic idempotency key when missing", async () => {
  await withEnv(
    {
      RESEND_API_URL: "https://api.resend.test/emails",
      RESEND_API_KEY: "re_test_key",
      RESEND_FROM_EMAIL: "invites@example.com",
      EMAIL_PROVIDER_MAX_ATTEMPTS: "2",
      EMAIL_PROVIDER_BACKOFF_MS: "1",
    },
    async () => {
      const idempotencyKeys: string[] = [];
      let attempt = 0;

      await sendTransactionalEmail(
        {
          to: "member@example.com",
          subject: "Subject",
          html: "<p>Hello</p>",
          requestId: "req-xyz",
        },
        {
          fetchImpl: (_url, init) => {
            attempt += 1;
            const headers = new Headers(init?.headers);
            idempotencyKeys.push(headers.get("Idempotency-Key") ?? "");
            if (attempt === 1) {
              return Promise.resolve(new Response("failed", { status: 503 }));
            }
            return Promise.resolve(new Response("ok", { status: 200 }));
          },
          sleep: () => Promise.resolve(),
          now: () => 0,
        },
      );

      assertEquals(idempotencyKeys, [
        "req-xyz:member@example.com:1",
        "req-xyz:member@example.com:2",
      ]);
    },
  );
});

Deno.test("sendTransactionalEmail throws when provider config missing", async () => {
  await withEnv(
    {
      RESEND_API_KEY: null,
      RESEND_FROM_EMAIL: null,
      EMAIL_PROVIDER_MAX_ATTEMPTS: "1",
    },
    async () => {
      await assertRejects(
        () =>
          sendTransactionalEmail(
            {
              to: "member@example.com",
              subject: "Subject",
              html: "<p>Hello</p>",
              requestId: "req-missing",
            },
            {
              fetchImpl: () =>
                Promise.resolve(new Response("ok", { status: 200 })),
              sleep: () => Promise.resolve(),
              now: () => 0,
            },
          ),
        HttpError,
        "Email provider is not configured.",
      );
    },
  );
});
