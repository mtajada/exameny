import { assert, assertEquals } from "std/testing/asserts.ts";
import type { MetadataUpdate } from "../_shared/metadata-sync.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.test");
Deno.env.set("EXAMENY_SUPABASE_SECRET_KEY", "service-role-key");
Deno.env.set("MEMBERSHIP_CLEANUP_SECRET", "job-secret");

const { __testing } = await import(
  "../deactivate-expired-memberships/index.ts"
);

type DbError = { message?: string };
type DbResult = { data: unknown; error: DbError | null };
type RpcBuilder = { single: <T = unknown>() => PromiseLike<DbResult> };
type FilterBuilder = {
  eq: (field: string, value: unknown) => FilterBuilder;
  lt: (field: string, value: unknown) => FilterBuilder;
  returns: <T = unknown>() => PromiseLike<DbResult>;
};
type TableBuilder = { select: (columns?: string) => FilterBuilder };
type QueryBuilder = TableBuilder & FilterBuilder;
type AdminClient = {
  from: (tableName: string) => TableBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => RpcBuilder;
};

Deno.test("deactivate-expired-memberships applies metadata updates returned by admin_manage_membership", async () => {
  const metadataApplied: MetadataUpdate[][] = [];
  const extractCalls: Array<{ targets: unknown; fallback: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const metadataPayload = { app_metadata: { synced_user_id: "user-42" } };
  const metadataTargets = [
    {
      user_id: "user-42",
      metadata_payload: metadataPayload,
      should_refresh_session: true,
      request_id: "req-sync",
    },
  ];
  const updates: MetadataUpdate[] = [{
    userId: "user-42",
    payload: metadataPayload,
    shouldRefreshSession: true,
    requestId: "req-sync",
  }];

  const buildQuery = (): QueryBuilder => ({
    select: (_columns?: string) => buildQuery(),
    eq: (_field: string, _value: unknown) => buildQuery(),
    lt: (_field: string, _value: unknown) => buildQuery(),
    returns: <T = unknown>() =>
      Promise.resolve({ data: [{ id: 1, user_id: "user-42" }], error: null }),
  });

  const adminClient: AdminClient = {
    from: () => buildQuery(),
    rpc: (name: string, args?: Record<string, unknown>) => {
      const params = args ?? {};
      rpcCalls.push({ name, args: params });
      if (name === "admin_manage_membership") {
        const membershipId =
          (params as { p_membership_id?: unknown }).p_membership_id;
        return {
          single: <T = unknown>() =>
            Promise.resolve({
              data: {
                id: membershipId,
                user_id: "user-42",
                metadata_payload: metadataPayload,
                should_refresh_session: true,
                request_id: "req-sync",
                metadata_targets: metadataTargets,
              },
              error: null,
            }),
        };
      }
      throw new Error(`Unexpected RPC call ${name}`);
    },
  };

  const handler = __testing.createHandler({
    createClient: () => adminClient,
    extractMetadataUpdates: (targets, fallback) => {
      extractCalls.push({ targets, fallback });
      return updates;
    },
    applyMetadataUpdates: (received, errorMessage) => {
      metadataApplied.push(received);
      assertEquals(
        errorMessage,
        "Failed to refresh user session after deactivation.",
      );
      return Promise.resolve();
    },
  });

  const res = await handler(
    new Request(
      "https://example.supabase.test/functions/v1/deactivate-expired-memberships",
      {
        method: "POST",
        headers: { "x-job-secret": "job-secret" },
      },
    ),
  );

  assertEquals(res.status, 200);
  const manageCall = rpcCalls.find((call) =>
    call.name === "admin_manage_membership"
  );
  assert(manageCall);
  assertEquals(extractCalls.length, 1);
  assertEquals(extractCalls[0].targets, metadataTargets);
  assertEquals(extractCalls[0].fallback, {
    userId: "user-42",
    payload: metadataPayload,
    shouldRefreshSession: true,
    requestId: "req-sync",
  });
  assertEquals(metadataApplied, [updates]);
});
