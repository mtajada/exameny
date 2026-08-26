import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { createCorsHeaders } from "../_shared/cors.ts";
import {
  applyMetadataUpdates,
  extractMetadataUpdates,
} from "../_shared/metadata-sync.ts";

type DbError = { message?: string };
type DbResult = { data: unknown; error: DbError | null };
type RpcBuilder = { single: <T = unknown>() => PromiseLike<DbResult> };
type FilterBuilder = {
  eq: (field: string, value: unknown) => FilterBuilder;
  lt: (field: string, value: unknown) => FilterBuilder;
  returns: <T = unknown>() => PromiseLike<DbResult>;
};
type TableBuilder = {
  select: (columns?: string) => FilterBuilder;
};
type AdminClient = {
  from: (tableName: string) => TableBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => RpcBuilder;
};
type CreateClient = (...args: Parameters<typeof createClient>) => AdminClient;

type FilterBuilderLike = {
  select: (columns?: string) => unknown;
  eq: (field: string, value: unknown) => unknown;
  lt: (field: string, value: unknown) => unknown;
  returns: <T = unknown>() => PromiseLike<DbResult>;
};

type TableBuilderLike = {
  select: (columns?: string) => unknown;
};

type HandlerDeps = {
  createClient?: CreateClient;
  applyMetadataUpdates: typeof applyMetadataUpdates;
  extractMetadataUpdates: typeof extractMetadataUpdates;
};

type AdminManageMembershipRow = {
  id: number;
  academy_id: number;
  user_id: string | null;
  email: string;
  role: string;
  status: string;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  created_at: string;
  updated_at: string;
  metadata_payload?: unknown;
  should_refresh_session?: unknown;
  request_id?: unknown;
  metadata_targets?: unknown;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const EXAMENY_SUPABASE_SECRET_KEY =
  Deno.env.get("EXAMENY_SUPABASE_SECRET_KEY") ?? "";
const MEMBERSHIP_CLEANUP_SECRET = Deno.env.get("MEMBERSHIP_CLEANUP_SECRET");
const METADATA_SYNC_COPY = "Failed to refresh user session after deactivation.";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? value as T[] : [];

const asAdminManageMembershipRow = (
  value: unknown,
): AdminManageMembershipRow | null =>
  isPlainRecord(value) ? value as AdminManageMembershipRow : null;

const wrapFilterBuilder = (builder: FilterBuilderLike): FilterBuilder => ({
  eq: (field: string, value: unknown) =>
    wrapFilterBuilder(builder.eq(field, value) as FilterBuilderLike),
  lt: (field: string, value: unknown) =>
    wrapFilterBuilder(builder.lt(field, value) as FilterBuilderLike),
  returns: builder.returns,
});

const wrapTableBuilder = (builder: TableBuilderLike): TableBuilder => ({
  select: (columns?: string) =>
    wrapFilterBuilder(builder.select(columns) as FilterBuilderLike),
});

const defaultCreateClient: CreateClient = (...args) => {
  const client = createClient(...args);
  return {
    from: (tableName: string) => wrapTableBuilder(client.from(tableName)),
    rpc: (fn: string, args?: Record<string, unknown>) => client.rpc(fn, args),
  };
};

if (!SUPABASE_URL || !EXAMENY_SUPABASE_SECRET_KEY) {
  console.error(
    "deactivate-expired-memberships: missing Supabase environment variables",
  );
}
if (!MEMBERSHIP_CLEANUP_SECRET) {
  console.error(
    "deactivate-expired-memberships: MEMBERSHIP_CLEANUP_SECRET is not set",
  );
}

console.log(`🚀 Function 'deactivate-expired-memberships' up and running!`);

const createHandler = (overrides?: Partial<HandlerDeps>) => {
  const deps: HandlerDeps = {
    applyMetadataUpdates,
    extractMetadataUpdates,
    ...(overrides ?? {}),
  };

  return async (req: Request): Promise<Response> => {
    const corsHeaders = createCorsHeaders(req);
    const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        headers: jsonHeaders,
        status: 405,
      });
    }

    const providedSecret = req.headers.get("x-job-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
    if (
      !MEMBERSHIP_CLEANUP_SECRET || !providedSecret ||
      providedSecret !== MEMBERSHIP_CLEANUP_SECRET
    ) {
      console.warn(
        "deactivate-expired-memberships: unauthorized invocation attempt",
      );
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: jsonHeaders,
        status: 401,
      });
    }

    try {
      const createClientFn = deps.createClient ?? defaultCreateClient;
      const adminSupabaseClient = createClientFn(
        SUPABASE_URL,
        EXAMENY_SUPABASE_SECRET_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );

      // Get the current date in 'YYYY-MM-DD' format.
      const today = new Date().toISOString().split("T")[0];

      console.log("[deactivate-expired-memberships] Job started.");

      // Find all active student memberships where the subscription_end_date is in the past.
      const { data: expiredMembershipsData, error: selectError } =
        await adminSupabaseClient
          .from("academy_memberships")
          .select("id")
          .eq("role", "student")
          .eq("status", "active")
          .lt("subscription_end_date", today)
          .returns<Array<{ id: number }>>();

      if (selectError) {
        console.error("Error selecting expired memberships:");
        return new Response(
          JSON.stringify({ error: "Failed to query expired memberships." }),
          {
            headers: jsonHeaders,
            status: 500,
          },
        );
      }

      const expiredMemberships = asArray<{ id: number }>(
        expiredMembershipsData,
      );
      if (expiredMemberships.length === 0) {
        console.log("No expired student memberships found. Exiting.");
        return new Response(
          JSON.stringify({ message: "No expired memberships to deactivate." }),
          {
            headers: jsonHeaders,
            status: 200,
          },
        );
      }

      let processed = 0;
      for (const membership of expiredMemberships) {
        const requestId = crypto.randomUUID();
        const { data: managedMembershipData, error: manageError } =
          await adminSupabaseClient
            .rpc("admin_manage_membership", {
              p_membership_id: membership.id,
              p_status: "inactive",
              p_request_id: requestId,
            })
            .single<AdminManageMembershipRow>();

        const managedMembership = asAdminManageMembershipRow(
          managedMembershipData,
        );
        if (manageError || !managedMembership) {
          console.error(`Error deactivating membership :`);
          return new Response(
            JSON.stringify({ error: "Failed to deactivate memberships." }),
            {
              headers: jsonHeaders,
              status: 500,
            },
          );
        }

        const metadataUpdates = deps.extractMetadataUpdates(
          managedMembership.metadata_targets,
          {
            userId: managedMembership.user_id,
            payload: managedMembership.metadata_payload,
            shouldRefreshSession: managedMembership.should_refresh_session,
            requestId: managedMembership.request_id ?? requestId,
          },
        );

        if (metadataUpdates.length) {
          try {
            await deps.applyMetadataUpdates(
              metadataUpdates,
              METADATA_SYNC_COPY,
            );
          } catch (_error) {
            console.error(`Error applying metadata for user :`);
            return new Response(
              JSON.stringify({ error: "Failed to refresh user session." }),
              {
                headers: jsonHeaders,
                status: 500,
              },
            );
          }
        }
        processed += 1;
      }

      console.log(`Successfully deactivated ${processed} memberships.`);

      return new Response(
        JSON.stringify({
          message: `Successfully deactivated ${processed} memberships.`,
        }),
        {
          headers: jsonHeaders,
          status: 200,
        },
      );
    } catch (_error) {
      console.error("An unexpected error occurred:");
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        headers: jsonHeaders,
        status: 500,
      });
    }
  };
};

const handler = createHandler();

if (import.meta.main) {
  serve(handler);
}

export const __testing = { createHandler };
