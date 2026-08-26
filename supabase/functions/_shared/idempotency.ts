import { getServiceRoleClient } from "./auth.ts";

export type JsonRecord = Record<string, unknown>;

interface CacheRow {
  response_payload: JsonRecord;
}

const TABLE_NAME = "edge_function_idempotency";

export async function readCachedEdgeResponse(
  functionName: string,
  requestId: string,
  userId: string,
): Promise<JsonRecord | null> {
  if (!functionName || !requestId || !userId) {
    return null;
  }

  const { data, error } = await getServiceRoleClient()
    .from(TABLE_NAME)
    .select("response_payload")
    .eq("function_name", functionName)
    .eq("request_id", requestId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[idempotency]", "read cache failed", { requestId });
    return null;
  }

  const record = data as CacheRow | null;
  return record?.response_payload ?? null;
}

export async function writeCachedEdgeResponse(
  functionName: string,
  requestId: string,
  userId: string,
  payload: JsonRecord,
): Promise<void> {
  if (!functionName || !requestId || !userId) {
    return;
  }
  const { error } = await getServiceRoleClient()
    .from(TABLE_NAME)
    .upsert(
      [{
        function_name: functionName,
        request_id: requestId,
        user_id: userId,
        response_payload: payload,
      }],
      { onConflict: "function_name,request_id,user_id" },
    );

  if (error) {
    console.warn("[idempotency]", "write cache failed", { requestId });
  }
}
