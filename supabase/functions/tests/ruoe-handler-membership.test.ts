Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("EXAMENY_SUPABASE_SECRET_KEY", "test-service-role-key");
Deno.env.set("EXAMENY_SUPABASE_PUBLISHABLE_KEY", "test-anon-key");

import {
  assertEquals,
  assertInstanceOf,
  assertRejects,
} from "std/testing/asserts.ts";

import { HttpError } from "../_shared/http-errors.ts";

const { ensureAuthorHasActiveMembership } = await import(
  "../_shared/ruoe-handler.ts"
);

Deno.test("ensureAuthorHasActiveMembership resolves when loader returns active membership", async () => {
  const membership = await ensureAuthorHasActiveMembership(() =>
    Promise.resolve({
      data: { id: 42, status: "active" },
      error: null,
    })
  );

  assertEquals(membership, { id: 42, status: "active" });
});

Deno.test("ensureAuthorHasActiveMembership rejects when membership is missing", async () => {
  const error = await assertRejects(
    () =>
      ensureAuthorHasActiveMembership(() =>
        Promise.resolve({
          data: null,
          error: null,
        })
      ),
    HttpError,
  );

  assertInstanceOf(error, HttpError);
  assertEquals(error.status, 403);
  assertEquals(error.message, "Author must belong to the same academy.");
});

Deno.test("ensureAuthorHasActiveMembership rejects when membership is inactive", async () => {
  const error = await assertRejects(
    () =>
      ensureAuthorHasActiveMembership(() =>
        Promise.resolve({
          data: { id: 99, status: "inactive" },
          error: null,
        })
      ),
    HttpError,
  );

  assertInstanceOf(error, HttpError);
  assertEquals(error.status, 403);
  assertEquals(error.message, "Author must belong to the same academy.");
});

Deno.test("ensureAuthorHasActiveMembership surfaces loader errors as 500 responses", async () => {
  const loaderError = new Error("database unavailable");

  const error = await assertRejects(
    () =>
      ensureAuthorHasActiveMembership(() =>
        Promise.resolve({
          data: null,
          error: loaderError,
        })
      ),
    HttpError,
  );

  assertInstanceOf(error, HttpError);
  assertEquals(error.status, 500);
  assertEquals(error.message, "Could not validate author membership.");
  assertEquals(error.details, loaderError);
});
