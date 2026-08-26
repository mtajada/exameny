import { assert, assertEquals, assertRejects } from "std/testing/asserts.ts";
import { HttpError } from "../_shared/http-errors.ts";
import type { SendEmailInput } from "../_shared/email.ts";

Deno.env.set("SUPABASE_URL", "https://example.test");
Deno.env.set("EXAMENY_SUPABASE_PUBLISHABLE_KEY", "anon-test-key");
Deno.env.set("EXAMENY_SUPABASE_SECRET_KEY", "service-test-key");

const { __testing } = await import("../super-admin-invite/index.ts");

type AdminClient = Parameters<
  typeof __testing.executeInviteFlow
>[0]["adminSupabaseClient"];

Deno.test("sendInvitationWithLoginReminderFallback builds resend metadata and falls back on failure", async () => {
  const inviteCalls: Array<
    { idempotencyKey?: string; tags?: Array<{ name: string; value: string }> }
  > = [];
  const reminderCalls: Array<unknown> = [];

  const outcome = await __testing.sendInvitationWithLoginReminderFallback({
    email: "member@example.com",
    academyId: 12,
    academyName: "Mode Demo",
    siteUrl: "https://example.com",
    authRedirect: "https://example.com/auth?p_membership_id=99",
    requestId: "req-resend",
    mode: "resend",
    log: () => {},
    sendEmail: (payload: SendEmailInput) => {
      inviteCalls.push({
        idempotencyKey: payload.idempotencyKey,
        tags: payload.tags,
      });
      return Promise.reject(new Error("provider unavailable"));
    },
    sendLoginReminder: (payload) => {
      reminderCalls.push(payload);
      return Promise.resolve();
    },
  });

  assertEquals(outcome, "login_reminder");
  assertEquals(inviteCalls.length, 1);
  assertEquals(
    inviteCalls[0].idempotencyKey,
    "req-resend:super-admin-invite:resend:member@example.com",
  );
  assertEquals(inviteCalls[0].tags, [
    { name: "academy_id", value: "12" },
    { name: "invite_mode", value: "resend" },
    { name: "invite_role", value: "academy_admin" },
  ]);
  assertEquals(reminderCalls.length, 1);
  const reminder = reminderCalls[0] as {
    tags?: Array<{ name: string; value: string }>;
  };
  const inviteOutcomeTag = reminder.tags?.find((tag) =>
    tag.name === "invite_outcome"
  );
  assert(inviteOutcomeTag);
  assertEquals(inviteOutcomeTag!.value, "login_reminder");
});

Deno.test("admin membership metadata unpacks PostgREST table responses", () => {
  const updates = __testing.extractAdminManageMetadataUpdates([{
    user_id: null,
    metadata_payload: null,
    metadata_targets: [{
      user_id: "00000000-0000-4000-8000-000000000123",
      metadata_payload: {
        app_metadata: { memberships: [] },
      },
      should_refresh_session: true,
      request_id: "00000000-0000-4000-8003-000000000123",
    }],
    request_id: "00000000-0000-4000-8003-000000000123",
  }], "fallback-request");

  assertEquals(updates, [{
    userId: "00000000-0000-4000-8000-000000000123",
    payload: {
      app_metadata: { memberships: [] },
    },
    shouldRefreshSession: true,
    requestId: "00000000-0000-4000-8003-000000000123",
  }]);
});

Deno.test("executeInviteFlow force resets linked membership without deleting its Auth user", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const reminderCalls: Array<unknown> = [];

  const inviteCalls: SendEmailInput[] = [];
  const adminClient: AdminClient = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args: args ?? {} });
      if (fn === "admin_manage_membership") {
        return Promise.resolve({
          data: {
            id: 44,
            academy_id: 5,
            role: "academy_admin",
            status: "awaiting_login",
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  const result = await __testing.executeInviteFlow({
    adminSupabaseClient: adminClient,
    existingMembership: {
      id: 44,
      academy_id: 5,
      user_id: "user-abc",
      role: "academy_admin",
      status: "active",
    },
    academyId: 5,
    academyName: "Resettable",
    email: "reset@example.com",
    forceReset: true,
    siteUrl: "https://example.com",
    requestId: "req-force",
    log: () => {},
    sendEmail: (payload: SendEmailInput) => {
      inviteCalls.push(payload);
      return Promise.resolve();
    },
    sendLoginReminder: (payload) => {
      reminderCalls.push(payload);
      return Promise.resolve();
    },
  });

  assertEquals(result.inviteOutcome, "invitation");
  const manageCall = rpcCalls.find((call) =>
    call.fn === "admin_manage_membership"
  );
  assert(
    manageCall,
    "admin_manage_membership should be called for linked membership",
  );
  assertEquals(manageCall!.args.p_clear_user, true);
  assertEquals("p_delete_auth_user" in manageCall!.args, false);
  assertEquals(manageCall!.args.p_request_id, "req-force");
  assertEquals(manageCall!.args.p_status, "awaiting_login");
  assertEquals(inviteCalls.length, 1);
  assertEquals(reminderCalls.length, 0);
});

Deno.test("executeInviteFlow rejects role conflicts for linked non-admin membership", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const adminClient: AdminClient = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args: args ?? {} });
      return Promise.resolve({ data: null, error: null });
    },
  };

  const run = () =>
    __testing.executeInviteFlow({
      adminSupabaseClient: adminClient,
      existingMembership: {
        id: 55,
        academy_id: 6,
        user_id: "user-conflict",
        role: "teacher",
        status: "active",
      },
      academyId: 6,
      academyName: "Conflict",
      email: "teacher-conflict@example.com",
      forceReset: true,
      siteUrl: "https://example.com",
      requestId: "req-conflict-linked",
      log: () => {},
      sendEmail: (_payload: SendEmailInput) => Promise.resolve(),
      sendLoginReminder: (_payload) => Promise.resolve(),
    });

  await assertRejects(run, HttpError, "ROLE_CONFLICT");
  assertEquals(rpcCalls.length, 0);
});
