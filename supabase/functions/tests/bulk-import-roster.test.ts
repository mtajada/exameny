import { assert, assertEquals } from "std/testing/asserts.ts";

import {
  promoteMembershipToTeacher,
  type Role,
} from "../bulk-import-roster/promotion.ts";
import {
  __testing,
  buildMembershipRedirect,
  handleBulkImportRoster,
  reconcileMembershipStatusResponse,
} from "../bulk-import-roster/index.ts";
import type { MembershipRecord } from "../bulk-import-roster/index.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("EXAMENY_SUPABASE_PUBLISHABLE_KEY", "anon-key");
Deno.env.set("EXAMENY_SUPABASE_SECRET_KEY", "service-role-key");
Deno.env.set("SITE_URL", "https://example.ex");

type RpcError = { message: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcBuilder = PromiseLike<RpcResult> & {
  single: <T = unknown>() => PromiseLike<RpcResult>;
};
type RpcHandler = (args: Record<string, unknown>) => RpcResult;

type QueryResult = RpcResult;
type SelectBuilder = {
  select: (columns?: string) => SelectBuilder;
  maybeSingle: <T = unknown>() => PromiseLike<QueryResult>;
  returns: <T = unknown>() => PromiseLike<QueryResult>;
};
type FilterBuilder = SelectBuilder & {
  eq: (field: string, value: unknown) => FilterBuilder;
  in: (field: string, values: unknown[]) => FilterBuilder;
};
type TableBuilder = {
  select: (columns?: string) => FilterBuilder;
  insert: (record: unknown) => FilterBuilder;
  update: (record: unknown) => FilterBuilder;
  delete: () => FilterBuilder;
};

type BulkImportSupabaseClient = {
  from: (tableName: string) => TableBuilder;
  rpc: (name: string, args?: Record<string, unknown>) => RpcBuilder;
  schema: (
    schemaName: string,
  ) => { rpc: (name: string, args?: Record<string, unknown>) => RpcBuilder };
  auth: {
    getUser: () => PromiseLike<
      { data: { user: { id: string } | null } | null; error: RpcError | null }
    >;
  };
};

type BulkImportCreateClient = (
  supabaseUrl: string,
  supabaseKey: string,
  options?: { global?: { headers?: Record<string, string> } },
) => BulkImportSupabaseClient;

type CreateClient = BulkImportCreateClient;
type BulkImportClient = BulkImportSupabaseClient;
type PromoteClient = {
  rpc: (name: string, args?: Record<string, unknown>) => RpcBuilder;
};
type SyncMetadataAdminClient = Parameters<
  typeof __testing.syncMetadataAfterMembershipChange
>[0]["adminClient"];

type MembershipRow = MembershipRecord & Record<string, unknown>;
type AcademyRow = Record<string, unknown> & { id: number; name: string };
type ClassRow = Record<string, unknown> & {
  id: number;
  academy_id?: number;
  name: string;
  description?: string | null;
};
type ClassMemberRow = Record<string, unknown> & {
  class_id: number;
  membership_id: number;
  academy_memberships?: { role?: Role; user_id?: string | null } | null;
};
type StudentProfileRow = Record<string, unknown> & {
  membership_id: number;
  assigned_teacher_id?: string | null;
};

type TableRecords = {
  academy_memberships: MembershipRow;
  academies: AcademyRow;
  classes: ClassRow;
  class_members: ClassMemberRow;
  student_profiles: StudentProfileRow;
};

type TableStores = {
  [K in keyof TableRecords]: Array<TableRecords[K]>;
};

type StubFactoryConfig = {
  rpcHandlers: Record<string, RpcHandler>;
  tables?: Partial<TableStores>;
};

type BulkImportResponseBody = {
  summary: {
    newMemberships: number;
    updatedMemberships: number;
    reactivatedMemberships: number;
  };
  issues: Array<
    { row: number; email?: string; error?: string; warnings?: string[] }
  >;
  request_id?: string;
  error?: string;
};

const makeRpcBuilder = (data: unknown, error: RpcError | null): RpcBuilder => {
  const base = Promise.resolve({ data, error });
  return Object.assign(base, {
    single: <T = unknown>() => Promise.resolve({ data, error }),
  });
};

const createStubSupabaseFactory = (config: StubFactoryConfig) => {
  const tables: TableStores = {
    academy_memberships: config.tables?.academy_memberships ?? [],
    academies: config.tables?.academies ?? [{ id: 1, name: "Test Academy" }],
    classes: config.tables?.classes ?? [],
    class_members: config.tables?.class_members ?? [],
    student_profiles: config.tables?.student_profiles ?? [],
  };

  const buildQuery = <TName extends keyof TableStores>(
    tableName: TName,
    filters: Array<(row: TableRecords[TName]) => boolean> = [],
    overrideResults?: Array<TableRecords[TName]>,
  ) => {
    const applyFilters = () =>
      tables[tableName].filter((row) => filters.every((fn) => fn(row)));
    const resolveResults = () => overrideResults ?? applyFilters();

    const updateRows = (patch: Partial<TableRecords[TName]>) => {
      const updated: Array<TableRecords[TName]> = [];
      const store = tables[tableName];
      const nextRows = store.map((row) => {
        if (filters.every((fn) => fn(row))) {
          const next = { ...row, ...patch } as TableRecords[TName];
          updated.push(next);
          return next;
        }
        return row;
      });
      store.length = 0;
      store.push(...nextRows);
      return updated;
    };

    const deleteRows = () => {
      const removed: Array<TableRecords[TName]> = [];
      const remaining: Array<TableRecords[TName]> = [];
      const store = tables[tableName];
      store.forEach((row) => {
        if (filters.every((fn) => fn(row))) {
          removed.push(row);
        } else {
          remaining.push(row);
        }
      });
      store.length = 0;
      store.push(...remaining);
      return removed;
    };

    return {
      select: () => buildQuery(tableName, filters, overrideResults),
      eq: (field: string, value: unknown) => {
        filters.push((row) => row[field] === value);
        return buildQuery(tableName, filters, overrideResults);
      },
      in: (field: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[field]));
        return buildQuery(tableName, filters, overrideResults);
      },
      maybeSingle: <T = unknown>() => {
        const data = resolveResults();
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      returns: <T = unknown>() => {
        const data = resolveResults();
        return Promise.resolve({ data, error: null });
      },
      insert: (record: unknown) => {
        const rows = Array.isArray(record)
          ? record as Array<TableRecords[TName]>
          : [record as TableRecords[TName]];
        tables[tableName].push(...rows);
        return buildQuery(tableName, filters, rows);
      },
      update: (record: unknown) => {
        const updated = updateRows(record as Partial<TableRecords[TName]>);
        return buildQuery(tableName, filters, updated);
      },
      delete: () => {
        const removed = deleteRows();
        return buildQuery(tableName, filters, removed);
      },
    };
  };

  const userRpc = (name: string) => {
    if (name === "get_my_academy_id_from_jwt") {
      return makeRpcBuilder(1, null);
    }
    if (name === "get_my_role_from_jwt") {
      return makeRpcBuilder("academy_admin", null);
    }
    return makeRpcBuilder(null, { message: `Unhandled user rpc ${name}` });
  };

  const userClient: BulkImportClient = {
    rpc: (name: string) => userRpc(name),
    from: (tableName: string) => buildQuery(tableName as keyof TableStores),
    schema: (_schemaName: string) => ({ rpc: userRpc }),
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "user-123" } },
          error: null,
        }),
    },
  };

  const adminClient: BulkImportClient = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      const handler = config.rpcHandlers[name];
      const { data, error } = handler
        ? handler(args ?? {})
        : { data: null, error: { message: `Unhandled rpc ${name}` } };
      return makeRpcBuilder(data, error);
    },
    from: (tableName: string) => buildQuery(tableName as keyof TableStores),
    schema: (_schemaName: string) => ({
      rpc: (name: string, args?: Record<string, unknown>) => {
        const handler = config.rpcHandlers[name];
        const { data, error } = handler
          ? handler(args ?? {})
          : { data: null, error: { message: `Unhandled rpc ${name}` } };
        return makeRpcBuilder(data, error);
      },
    }),
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "admin-123" } },
          error: null,
        }),
    },
  };

  return (_supabaseUrl: string, supabaseKey: string) =>
    supabaseKey === "service-role-key" ? adminClient : userClient;
};

const baseMembership = {
  id: 42,
  academy_id: 1,
  email: "existing-teacher@example.com",
  role: "student",
  status: "active",
  user_id: "d598bedf-2a5f-4dfb-9a6c-bdfd64ccf060",
  subscription_start_date: "2024-01-01",
  subscription_end_date: "2024-12-31",
} as const;

Deno.test("promoteMembershipToTeacher invokes the service-only role migration RPC with actor context", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const adminClient: PromoteClient = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args: args ?? {} });
      return makeRpcBuilder({
        metadata_payload: null,
        should_refresh_session: false,
        request_id: null,
      }, null);
    },
  };

  const result = await promoteMembershipToTeacher(adminClient, {
    ...baseMembership,
  }, {
    userId: "actor-1",
    academyId: 1,
    isPlatformAdmin: false,
  });

  assertEquals(calls.length, 1);
  const [{ name, args }] = calls;
  assertEquals(name, "migrate_membership_role");
  assertEquals(args, {
    p_actor_user_id: "actor-1",
    p_actor_academy_id: 1,
    p_actor_is_platform_admin: false,
    p_membership_id: baseMembership.id,
    p_new_role: "teacher",
    p_reason: "bulk_import_roster",
  });
  assert(result.membership);
  assertEquals(result.membership.role, "teacher");
});

Deno.test("promoteMembershipToTeacher forwards request id to migration RPC payload", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const adminClient: PromoteClient = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args: args ?? {} });
      return makeRpcBuilder({
        metadata_payload: null,
        should_refresh_session: false,
        request_id: "req-123",
      }, null);
    },
  };

  const result = await promoteMembershipToTeacher(
    adminClient,
    { ...baseMembership },
    { userId: "actor-1", academyId: 1, isPlatformAdmin: false },
    "req-123",
  );

  assertEquals(calls.length, 1);
  const [{ name, args }] = calls;
  assertEquals(name, "migrate_membership_role");
  assertEquals(args, {
    p_actor_user_id: "actor-1",
    p_actor_academy_id: 1,
    p_actor_is_platform_admin: false,
    p_membership_id: baseMembership.id,
    p_new_role: "teacher",
    p_reason: "bulk_import_roster",
    p_request_id: "req-123",
  });
  assert(result.membership);
  assertEquals(result.membership.role, "teacher");
  assertEquals(
    (result.membership as { request_id?: string | null }).request_id,
    "req-123",
  );
});

Deno.test("promoteMembershipToTeacher surfaces RPC errors without membership payload", async () => {
  const adminClient: PromoteClient = {
    rpc: () => makeRpcBuilder(null, { message: "boom" }),
  };

  const result = await promoteMembershipToTeacher(
    adminClient,
    { ...baseMembership },
    { userId: "actor-1", academyId: 1, isPlatformAdmin: false },
  );

  assertEquals(result.membership, undefined);
  assertEquals(result.errorMessage, "boom");
});

Deno.test("reconcileMembershipStatusResponse treats unchanged awaiting_login invite as warning", () => {
  const existing = {
    id: 101,
    email: "pending@example.com",
    role: "student",
    status: "awaiting_login",
    user_id: null,
    subscription_start_date: null,
    subscription_end_date: null,
  } as MembershipRecord;
  const issues: Array<
    { row: number; email?: string; error?: string; warnings?: string[] }
  > = [];

  const { statusChangeSucceeded, shouldAbort, latest } =
    reconcileMembershipStatusResponse({
      existing,
      requestedStatus: "active",
      returnedMembership: { ...existing },
      issues,
      email: existing.email,
      rowIndex: 1,
    });

  assertEquals(statusChangeSucceeded, false);
  assertEquals(shouldAbort, false);
  assertEquals(latest.status, "awaiting_login");
  assertEquals(issues.length, 1);
  assertEquals(issues[0].warnings, [
    "Membership remained at status 'awaiting_login' (requested 'active') - proceeding without status change.",
  ]);
});

Deno.test("reconcileMembershipStatusResponse aborts when database returns unexpected status", () => {
  const existing = {
    id: 202,
    email: "unexpected@example.com",
    role: "student",
    status: "inactive",
    user_id: "a0651eb5-6b70-4b53-8479-e0e3e0d13a31",
    subscription_start_date: "2024-01-01",
    subscription_end_date: null,
  } as MembershipRecord;
  const returned = {
    ...existing,
    status: "awaiting_login",
  } as MembershipRecord;
  const issues: Array<
    { row: number; email?: string; error?: string; warnings?: string[] }
  > = [];

  const { statusChangeSucceeded, shouldAbort } =
    reconcileMembershipStatusResponse({
      existing,
      requestedStatus: "active",
      returnedMembership: returned,
      issues,
      email: existing.email,
      rowIndex: 2,
    });

  assertEquals(statusChangeSucceeded, false);
  assertEquals(shouldAbort, true);
  assertEquals(issues.length, 1);
  assertEquals(
    issues[0].error,
    "Update membership failed: requested status 'active' but database returned 'awaiting_login'",
  );
});

Deno.test("buildMembershipRedirect preserves numeric hints when membership payload contains bigint strings", () => {
  const siteUrl = "https://example.ex";
  const membershipWithHints = {
    id: "123",
    academy_id: "456",
  };

  const fallbackOnlyMembership = {
    id: "789",
  };

  const directRedirect = buildMembershipRedirect(
    siteUrl,
    membershipWithHints,
    null,
  );
  const fallbackRedirect = buildMembershipRedirect(
    siteUrl,
    fallbackOnlyMembership,
    "999",
  );

  assertEquals(
    directRedirect,
    `${siteUrl}/auth?p_membership_id=123&membership_id=123&academy_id=456`,
  );
  assertEquals(
    fallbackRedirect,
    `${siteUrl}/auth?p_membership_id=789&membership_id=789&academy_id=999`,
  );
});

Deno.test("syncMetadataAfterMembershipChange applies metadata payload from RPC response", async () => {
  const issues: Array<
    { row: number; email?: string; error?: string; warnings?: string[] }
  > = [];
  const applied: Array<{ userId: string; payload: unknown }> = [];
  const membership = { ...baseMembership };
  const adminClient: SyncMetadataAdminClient = {
    rpc: () => {
      throw new Error("sync_user_metadata should not be called");
    },
  };

  await __testing.syncMetadataAfterMembershipChange({
    adminClient,
    membership,
    metadataCandidates: [{
      metadata_payload: { app_metadata: { active_role: "student" } },
      should_refresh_session: true,
      request_id: "req-metadata",
    }],
    performedChange: true,
    fallbackRequestId: "req-bulk-import",
    issues,
    rowIndex: 7,
    applyMetadata: (userId, payload) => {
      applied.push({ userId, payload });
      return Promise.resolve();
    },
  });

  assertEquals(issues.length, 0);
  assertEquals(applied.length, 1);
  assertEquals(applied[0].userId, membership.user_id);
  assertEquals(applied[0].payload, {
    app_metadata: { active_role: "student" },
  });
});

Deno.test("syncMetadataAfterMembershipChange falls back to sync_user_metadata when RPC omits payload", async () => {
  const issues: Array<
    { row: number; email?: string; error?: string; warnings?: string[] }
  > = [];
  const applied: Array<{ userId: string; payload: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const membership = { ...baseMembership };
  const adminClient: SyncMetadataAdminClient = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args: args ?? {} });
      return makeRpcBuilder({
        metadata_payload: { app_metadata: { active_academy_id: 99 } },
        should_refresh_session: true,
        request_id: "req-sync",
      }, null);
    },
  };

  await __testing.syncMetadataAfterMembershipChange({
    adminClient,
    membership,
    metadataCandidates: [],
    performedChange: true,
    fallbackRequestId: "req-bulk-import",
    issues,
    rowIndex: 8,
    applyMetadata: (userId, payload) => {
      applied.push({ userId, payload });
      return Promise.resolve();
    },
  });

  assertEquals(issues.length, 0);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].name, "sync_user_metadata");
  assertEquals(rpcCalls[0].args.p_user_id, membership.user_id);
  assertEquals(rpcCalls[0].args.p_request_id, "req-bulk-import");
  assertEquals(applied.length, 1);
  assertEquals(applied[0].payload, { app_metadata: { active_academy_id: 99 } });
});

Deno.test("syncMetadataAfterMembershipChange records issues when metadata application fails", async () => {
  const issues: Array<
    { row: number; email?: string; error?: string; warnings?: string[] }
  > = [];
  const membership = { ...baseMembership };
  const adminClient: SyncMetadataAdminClient = {
    rpc: () =>
      makeRpcBuilder({
        metadata_payload: { app_metadata: { memberships: [] } },
        should_refresh_session: true,
        request_id: "req-sync",
      }, null),
  };

  await __testing.syncMetadataAfterMembershipChange({
    adminClient,
    membership,
    metadataCandidates: [],
    performedChange: true,
    fallbackRequestId: "req-bulk-import",
    issues,
    rowIndex: 9,
    applyMetadata: () => Promise.reject(new Error("apply failed")),
  });

  assertEquals(issues.length, 1);
  assertEquals(issues[0]?.row, 9);
  assert(issues[0]?.error?.includes("Metadata sync failed"));
});

Deno.test("syncMetadataAfterMembershipChange applies metadata_targets without falling back to sync_user_metadata", async () => {
  const issues: Array<
    { row: number; email?: string; error?: string; warnings?: string[] }
  > = [];
  const membership = { ...baseMembership };
  const appliedUpdates: Array<
    {
      userId: string;
      payload: unknown;
      shouldRefreshSession: boolean;
      requestId: string | null;
    }
  > = [];
  const adminClient: SyncMetadataAdminClient = {
    rpc: () => {
      throw new Error(
        "sync_user_metadata should not be called when metadata_targets are present",
      );
    },
  };

  await __testing.syncMetadataAfterMembershipChange({
    adminClient,
    membership,
    metadataCandidates: [],
    metadataTargets: [{
      user_id: membership.user_id,
      metadata_payload: { app_metadata: { active_role: "teacher" } },
      should_refresh_session: true,
      request_id: "req-target",
    }],
    performedChange: true,
    fallbackRequestId: "req-fallback",
    issues,
    rowIndex: 10,
    email: membership.email,
    applyMetadataUpdatesFn: (updates) => {
      updates.forEach((u) => appliedUpdates.push(u));
      return Promise.resolve();
    },
  });

  assertEquals(issues.length, 0);
  assertEquals(appliedUpdates.length, 1);
  assertEquals(appliedUpdates[0]?.userId, membership.user_id);
  assertEquals(appliedUpdates[0]?.payload, {
    app_metadata: { active_role: "teacher" },
  });
  assertEquals(appliedUpdates[0]?.requestId, "req-target");
});

Deno.test("bulk-import reactivates memberships via admin_manage_membership", async () => {
  const memberships: MembershipRecord[] = [{
    id: 201,
    academy_id: 1,
    email: "inactive@example.com",
    role: "student",
    status: "inactive",
    user_id: "user-1",
    subscription_start_date: "2024-01-01",
    subscription_end_date: "2024-12-31",
  }];

  const factory = createStubSupabaseFactory({
    rpcHandlers: {
      admin_manage_membership: () => ({
        data: {
          ...memberships[0],
          status: "active",
          metadata_targets: [],
        },
        error: null,
      }),
      update_membership_subscription_dates: () => ({ data: null, error: null }),
      admin_prepare_membership_invite: () => ({
        data: null,
        error: { message: "not expected" },
      }),
      sync_user_metadata: () => ({ data: null, error: null }),
    },
    tables: { academy_memberships: memberships },
  });

  const payload = {
    rows: [{
      email: "inactive@example.com",
      full_name: "Inactive User",
      role: "student" as const,
    }],
    options: {
      sendEmailsToNew: false,
      resendPendingInvites: false,
      sendLoginReminders: false,
    },
  };
  const req = new Request("http://example.ex", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
      "x-request-id": "req-react",
    },
    body: JSON.stringify(payload),
  });

  const resp = await handleBulkImportRoster(req, { createClient: factory });
  const body = await resp.json() as BulkImportResponseBody;

  assertEquals(resp.status, 200);
  assertEquals(body.summary.reactivatedMemberships, 1);
  assertEquals(body.summary.updatedMemberships, 1);
  assertEquals(body.summary.newMemberships, 0);
  assertEquals(body.request_id, "req-react");
  assertEquals(body.issues.length, 0);
});

Deno.test("bulk-import updates subscription dates via RPC", async () => {
  const memberships: MembershipRecord[] = [{
    id: 301,
    academy_id: 1,
    email: "active@example.com",
    role: "student",
    status: "active",
    user_id: "user-2",
    subscription_start_date: null,
    subscription_end_date: null,
  }];

  const factory = createStubSupabaseFactory({
    rpcHandlers: {
      admin_manage_membership: () => ({ data: null, error: null }),
      update_membership_subscription_dates: (args) => ({
        data: {
          ...memberships[0],
          subscription_start_date: args.p_subscription_start_date ??
            "2025-01-01",
          subscription_end_date: args.p_subscription_end_date,
          metadata_payload: null,
          should_refresh_session: false,
          metadata_targets: [],
        },
        error: null,
      }),
      admin_prepare_membership_invite: () => ({
        data: null,
        error: { message: "not expected" },
      }),
      sync_user_metadata: () => ({ data: null, error: null }),
    },
    tables: { academy_memberships: memberships },
  });

  const payload = {
    rows: [{
      email: "active@example.com",
      full_name: "Active User",
      role: "student" as const,
      subscription_end_date: "2026-01-01",
    }],
    options: {
      sendEmailsToNew: false,
      resendPendingInvites: false,
      sendLoginReminders: false,
    },
  };
  const req = new Request("http://example.ex", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
      "x-request-id": "req-dates",
    },
    body: JSON.stringify(payload),
  });

  const resp = await handleBulkImportRoster(req, { createClient: factory });
  const body = await resp.json() as BulkImportResponseBody;

  assertEquals(resp.status, 200);
  assertEquals(body.summary.updatedMemberships, 1);
  assertEquals(body.summary.reactivatedMemberships, 0);
  assertEquals(body.summary.newMemberships, 0);
  assertEquals(body.issues.length, 0);
});

Deno.test("bulk-import skips new membership counters when invite already exists (idempotent)", async () => {
  const memberships: MembershipRecord[] = [{
    id: 401,
    academy_id: 1,
    email: "existing@example.com",
    role: "student",
    status: "awaiting_login",
    user_id: null,
    subscription_start_date: null,
    subscription_end_date: null,
  }];

  const factory = createStubSupabaseFactory({
    rpcHandlers: {
      admin_manage_membership: () => ({ data: null, error: null }),
      update_membership_subscription_dates: () => ({ data: null, error: null }),
      admin_prepare_membership_invite: () => ({
        data: null,
        error: { message: "not expected" },
      }),
      sync_user_metadata: () => ({ data: null, error: null }),
    },
    tables: { academy_memberships: memberships },
  });

  const payload = {
    rows: [{
      email: "existing@example.com",
      full_name: "Existing Invite",
      role: "student" as const,
    }],
    options: {
      sendEmailsToNew: false,
      resendPendingInvites: false,
      sendLoginReminders: false,
    },
  };
  const req = new Request("http://example.ex", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resp = await handleBulkImportRoster(req, { createClient: factory });
  const body = await resp.json() as BulkImportResponseBody;

  assertEquals(resp.status, 200);
  assertEquals(body.summary.newMemberships, 0);
  assertEquals(body.summary.updatedMemberships, 0);
  assertEquals(body.summary.reactivatedMemberships, 0);
  assertEquals(body.issues.length, 0);
});

Deno.test("bulk-import surfaces ROLE_CONFLICT errors from RPCs", async () => {
  const memberships: MembershipRecord[] = [{
    id: 501,
    academy_id: 1,
    email: "conflict@example.com",
    role: "student",
    status: "inactive",
    user_id: "user-3",
    subscription_start_date: null,
    subscription_end_date: null,
  }];

  const factory = createStubSupabaseFactory({
    rpcHandlers: {
      admin_manage_membership: () => ({
        data: null,
        error: { message: "ROLE_CONFLICT" },
      }),
      update_membership_subscription_dates: () => ({ data: null, error: null }),
      admin_prepare_membership_invite: () => ({
        data: null,
        error: { message: "not expected" },
      }),
      sync_user_metadata: () => ({ data: null, error: null }),
    },
    tables: { academy_memberships: memberships },
  });

  const payload = {
    rows: [{
      email: "conflict@example.com",
      full_name: "Role Conflict",
      role: "student" as const,
    }],
    options: {
      sendEmailsToNew: false,
      resendPendingInvites: false,
      sendLoginReminders: false,
    },
  };
  const req = new Request("http://example.ex", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resp = await handleBulkImportRoster(req, { createClient: factory });
  const body = await resp.json() as BulkImportResponseBody;

  assertEquals(resp.status, 207);
  assertEquals(body.summary.updatedMemberships, 0);
  assertEquals(body.summary.reactivatedMemberships, 0);
  assertEquals(body.issues.length, 1);
  const conflictIssue = body.issues[0];
  assert(conflictIssue?.error?.includes("ROLE_CONFLICT"));
});
