import { assertEquals, assertRejects } from "std/testing/asserts.ts";

import { ADMIN_FORBIDDEN_COPY, HttpError } from "../_shared/http-errors.ts";
import type { AuthContext } from "../_shared/auth.ts";
import {
  authenticateAdminRequest,
  resolveAdminActorContext,
} from "../_shared/admin-auth.ts";

const buildBaseAuthContext = (
  overrides?: Partial<AuthContext>,
): AuthContext => ({
  user: {
    id: "user-1",
    aud: "authenticated",
    role: "authenticated",
    email: "user@example.com",
    created_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
  } as AuthContext["user"],
  profile: {
    id: "user-1",
    email: "user@example.com",
    role: "academy_admin",
    academy_id: 123,
    membership_id: 999,
    full_name: null,
    platform_role: null,
  },
  supabase: {} as AuthContext["supabase"],
  authorization: "Bearer test",
  ...(overrides ?? {}),
});

Deno.test("authenticateAdminRequest rejects when JWT claims say admin but DB membership check fails", async () => {
  const request = new Request("https://example.test/admin", {
    headers: { authorization: "Bearer token" },
  });

  await assertRejects(
    () =>
      authenticateAdminRequest(request, {
        requireAuth: () => Promise.resolve(buildBaseAuthContext()),
        fetchPlatformRole: () => Promise.resolve(null),
        fetchActiveAcademyId: () => Promise.resolve(123),
        fetchActiveAcademyAdminMembershipId: () => Promise.resolve(null),
      }),
    HttpError,
    ADMIN_FORBIDDEN_COPY,
  );
});

Deno.test("authenticateAdminRequest allows academy_admin when DB confirms active academy_admin membership", async () => {
  const request = new Request("https://example.test/admin", {
    headers: { authorization: "Bearer token" },
  });

  const context = await authenticateAdminRequest(request, {
    requireAuth: () =>
      Promise.resolve(
        buildBaseAuthContext({
          profile: { ...buildBaseAuthContext().profile, role: "student" },
        }),
      ),
    fetchPlatformRole: () => Promise.resolve(null),
    fetchActiveAcademyId: () => Promise.resolve(456),
    fetchActiveAcademyAdminMembershipId: () => Promise.resolve(42),
  });

  assertEquals(context.profile.role, "academy_admin");
  assertEquals(context.profile.platform_role, null);
  assertEquals(context.profile.academy_id, 456);
  assertEquals(context.profile.membership_id, 42);
});

Deno.test("authenticateAdminRequest allows platform admins based on DB profile role even if JWT metadata is stale", async () => {
  const request = new Request("https://example.test/admin", {
    headers: { authorization: "Bearer token" },
  });

  const base = buildBaseAuthContext({
    profile: {
      ...buildBaseAuthContext().profile,
      role: "academy_admin",
      platform_role: null,
      academy_id: 123,
    },
  });

  const context = await authenticateAdminRequest(request, {
    requireAuth: () => Promise.resolve(base),
    fetchPlatformRole: () => Promise.resolve("super_admin"),
    fetchActiveAcademyId: () => Promise.resolve(null),
    fetchActiveAcademyAdminMembershipId: () => Promise.resolve(null),
  });

  assertEquals(context.profile.role, "super_admin");
  assertEquals(context.profile.platform_role, "super_admin");
  assertEquals(context.profile.academy_id, null);

  const actor = resolveAdminActorContext(context);
  assertEquals(actor.actorIsPlatformAdmin, true);
  assertEquals(actor.actorAcademyId, null);
});

Deno.test("authenticateAdminRequest rejects academy_admin when no active academy is selected in DB", async () => {
  const request = new Request("https://example.test/admin", {
    headers: { authorization: "Bearer token" },
  });

  await assertRejects(
    () =>
      authenticateAdminRequest(request, {
        requireAuth: () => Promise.resolve(buildBaseAuthContext()),
        fetchPlatformRole: () => Promise.resolve(null),
        fetchActiveAcademyId: () => Promise.resolve(null),
        fetchActiveAcademyAdminMembershipId: () => Promise.resolve(42),
      }),
    HttpError,
    ADMIN_FORBIDDEN_COPY,
  );
});
