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

const toRpcResult = <T>(response: T): ReturnType<AdminClient["rpc"]> =>
  Promise.resolve(response) as ReturnType<AdminClient["rpc"]>;

Deno.test("sendInvitationWithLoginReminderFallback falls back to login reminder when invite send fails", async () => {
  const inviteCalls: Array<{ email: string; mode: string }> = [];
  const reminderCalls: Array<unknown> = [];

  const outcome = await __testing.sendInvitationWithLoginReminderFallback({
    email: "Admin@Example.com",
    academyId: 55,
    academyName: "Demo Academy",
    siteUrl: "https://example.com",
    authRedirect: "https://example.com/auth?p_membership_id=1",
    requestId: "req-login",
    mode: "create",
    log: () => {},
    sendEmail: (payload: SendEmailInput) => {
      inviteCalls.push({
        email: payload.to,
        mode: payload.tags?.find((tag) => tag.name === "invite_mode")?.value ??
          "",
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
  assertEquals(inviteCalls[0].mode, "create");
  assertEquals(reminderCalls.length, 1);
  const payload = reminderCalls[0] as {
    idempotencyKey: string;
    tags: Array<{ name: string; value: string }>;
  };
  assertEquals(
    payload.idempotencyKey,
    "req-login:super-admin-invite:login-reminder:Admin@Example.com",
  );
  assertEquals(payload.tags, [
    { name: "academy_id", value: "55" },
    { name: "invite_outcome", value: "login_reminder" },
    { name: "invite_role", value: "academy_admin" },
  ]);
});

Deno.test("executeInviteFlow prepares membership invite without mutating via tokenized link", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const adminClient: AdminClient = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args: args ?? {} });
      if (fn === "admin_prepare_membership_invite") {
        return toRpcResult({
          data: { id: 77n, academy_id: 901n },
          error: null,
        });
      }
      return toRpcResult({ data: null, error: null });
    },
  };

  const inviteCalls: SendEmailInput[] = [];
  const reminderCalls: unknown[] = [];

  const executeInviteFlowInput = {
    adminSupabaseClient: adminClient,
    existingMembership: null,
    academyId: 901,
    academyName: "Test Academy",
    email: "owner@example.com",
    forceReset: false,
    siteUrl: "https://example.com",
    requestId: "req-tokenless",
    log: () => {},
    sendEmail: (payload: SendEmailInput) => {
      inviteCalls.push(payload);
      return Promise.resolve();
    },
    sendLoginReminder: (payload) => {
      reminderCalls.push(payload);
      return Promise.resolve();
    },
  } satisfies Parameters<typeof __testing.executeInviteFlow>[0];

  const result = await __testing.executeInviteFlow(executeInviteFlowInput);

  assertEquals(result.inviteOutcome, "invitation");
  assertEquals(result.membershipForRedirect, { id: 77, academy_id: 901 });
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0], {
    fn: "admin_prepare_membership_invite",
    args: {
      p_academy_id: 901,
      p_email: "owner@example.com",
      p_role: "academy_admin",
    },
  });
  assertEquals(inviteCalls.length, 1);
  const inviteModeTag =
    (inviteCalls[0].tags as Array<{ name: string; value: string }> | undefined)
      ?.find(
        (tag) => tag.name === "invite_mode",
      );
  assertEquals(inviteModeTag?.value, "create");
  assertEquals(reminderCalls.length, 0);
});

Deno.test("executeInviteFlow resets existing unlinked membership to awaiting_login with request id", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const inviteCalls: SendEmailInput[] = [];

  const adminClient: AdminClient = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args: args ?? {} });
      if (fn === "admin_manage_membership") {
        return toRpcResult({
          data: {
            id: 333,
            academy_id: 7,
            role: "academy_admin",
            status: "awaiting_login",
          },
          error: null,
        });
      }
      return toRpcResult({ data: null, error: null });
    },
  };

  const executeInviteFlowInput = {
    adminSupabaseClient: adminClient,
    existingMembership: {
      id: 333,
      academy_id: 7,
      user_id: null,
      role: "academy_admin",
      status: "inactive",
    },
    academyId: 7,
    academyName: "Reset Academy",
    email: "admin-reset@example.com",
    forceReset: false,
    siteUrl: "https://reset.test",
    requestId: "req-reset",
    log: () => {},
    sendEmail: (payload: SendEmailInput) => {
      inviteCalls.push(payload);
      return Promise.resolve();
    },
    sendLoginReminder: () => Promise.resolve(),
  } satisfies Parameters<typeof __testing.executeInviteFlow>[0];

  const result = await __testing.executeInviteFlow(executeInviteFlowInput);

  assertEquals(result.inviteOutcome, "invitation");
  assert(
    result.membershipForRedirect && result.membershipForRedirect.id === 333,
  );
  const manageCall = rpcCalls.find((call) =>
    call.fn === "admin_manage_membership"
  );
  assert(
    manageCall,
    "admin_manage_membership should be called for existing membership without user_id",
  );
  assertEquals(manageCall!.args, {
    p_membership_id: 333,
    p_status: "awaiting_login",
    p_role: "academy_admin",
    p_email: "admin-reset@example.com",
    p_request_id: "req-reset",
  });
  assertEquals(inviteCalls.length, 1);
  const resendTag =
    (inviteCalls[0].tags as Array<{ name: string; value: string }> | undefined)
      ?.find(
        (tag) => tag.name === "invite_mode",
      );
  assertEquals(resendTag?.value, "resend");
});

Deno.test("executeInviteFlow rejects role conflicts for existing non-admin membership", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const adminClient: AdminClient = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args: args ?? {} });
      return toRpcResult({ data: null, error: null });
    },
  };

  await assertRejects(
    () =>
      __testing.executeInviteFlow({
        adminSupabaseClient: adminClient,
        existingMembership: {
          id: 222,
          academy_id: 9,
          user_id: null,
          role: "teacher",
          status: "inactive",
        },
        academyId: 9,
        academyName: "Conflict Academy",
        email: "conflict@example.com",
        forceReset: false,
        siteUrl: "https://conflict.test",
        requestId: "req-conflict",
        log: () => {},
        sendEmail: (_payload: SendEmailInput) => Promise.resolve(),
        sendLoginReminder: () => Promise.resolve(),
      }),
    HttpError,
    "ROLE_CONFLICT",
  );

  assertEquals(rpcCalls.length, 0);
});
