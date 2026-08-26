import { HttpError } from "./http-errors.ts";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type ListUserAcademiesResponse = {
  active_academies: unknown;
  inactive_academies: unknown;
};

export interface MembershipRecord {
  membershipId: number;
  academyId: number;
  academyName: string | null;
  role: string | null;
  status: string | null;
}

const parseNumericId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[-]?\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseMembershipEntry = (entry: unknown): MembershipRecord | null => {
  if (!isPlainRecord(entry)) {
    return null;
  }
  const record = entry;
  const membershipId = parseNumericId(
    record.membership_id ?? record.membershipId,
  );
  const academyId = parseNumericId(record.academy_id ?? record.academyId);
  if (membershipId === null || academyId === null) {
    return null;
  }
  const role = typeof record.role === "string" ? record.role : null;
  const status = typeof record.status === "string" ? record.status : null;
  const academyName = typeof record.academy_name === "string"
    ? record.academy_name
    : typeof record.academyName === "string"
    ? record.academyName
    : null;

  return {
    membershipId,
    academyId,
    academyName,
    role,
    status,
  };
};

const normalizeArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export async function listActiveMemberships(
  client: SupabaseClient,
): Promise<MembershipRecord[]> {
  const { data, error } = await client.rpc("list_user_academies").single<
    ListUserAcademiesResponse
  >();
  if (error) {
    throw new HttpError(500, "Could not load academy memberships.", error);
  }
  const entries = normalizeArray(data?.active_academies);
  return entries
    .map(parseMembershipEntry)
    .filter((entry): entry is MembershipRecord => entry !== null);
}

export function resolveActiveAcademyIdFromMetadata(user: User): number | null {
  const appMetadata = isPlainRecord(user.app_metadata) ? user.app_metadata : {};
  const candidate = appMetadata.active_academy_id ??
    appMetadata.activeAcademyId;
  return parseNumericId(candidate);
}

export async function ensureActiveMembershipForAcademy(
  client: SupabaseClient,
  _user: User,
  academyId: number,
): Promise<MembershipRecord> {
  const memberships = await listActiveMemberships(client);
  const match = memberships.find((entry) => entry.academyId === academyId);
  if (!match) {
    throw new HttpError(
      403,
      "You must belong to the selected academy to perform this action.",
    );
  }
  return match;
}
