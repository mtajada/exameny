import { serve } from "std/http/server.ts";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/auth.ts";
import { HttpError, isHttpError } from "../_shared/http-errors.ts";
import { buildPublicErrorPayload } from "../_shared/public-error.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import {
  authenticateAdminRequest,
  resolveAdminActorContext,
} from "../_shared/admin-auth.ts";

interface MemberRow {
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
}

interface PreferenceRow {
  user_id: string;
  full_name: string | null;
}

interface AliasConflictRow {
  membership_id: number;
  email_login: string;
  email_membership: string;
  detected_at: string;
}

interface NormalizedMember {
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
  full_name: string | null;
  has_alias_conflict: boolean;
  alias_conflict?: {
    email_login: string;
    email_membership: string;
    detected_at: string;
  } | null;
}

interface FiltersInput {
  status?: string | null;
  role?: string | null;
  search?: string | null;
  academyId?: number | null;
  page?: number | null;
  pageSize?: number | null;
}

interface MembersCount {
  total: number;
  awaiting_login: number;
  active: number;
  inactive: number;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
}

interface PaginatedMemberships {
  rows: MemberRow[];
  total: number;
  page: number;
  pageSize: number;
}

const MEMBERSHIP_FIELDS = [
  "id",
  "academy_id",
  "user_id",
  "email",
  "role",
  "status",
  "subscription_start_date",
  "subscription_end_date",
  "created_at",
  "updated_at",
];

const MEMBERS_QUERY_FAILURE_COPY = "Unable to load members.";
const PREFERENCES_QUERY_FAILURE_COPY = "Unable to load member names.";
const ALIAS_QUERY_FAILURE_COPY = "Unable to load alias conflicts.";
const ACTIVE_ACADEMY_REQUIRED_COPY =
  "Select an active academy before continuing.";
const ACADEMY_ID_REQUIRED_COPY =
  "Select an academy before listing its members.";
const NAME_SEARCH_FAILURE_COPY = "Unable to process the search filter.";
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_NAME_MATCHES = 500;

const normalizeFilterString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

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
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseFilters = (body: unknown): FiltersInput => {
  if (!isPlainRecord(body)) {
    return {};
  }
  const payload = body;
  return {
    status: normalizeFilterString(payload.status ?? payload.statusFilter),
    role: normalizeFilterString(payload.role ?? payload.roleFilter),
    search: normalizeFilterString(
      payload.search ?? payload.query ?? payload.searchTerm,
    ),
    academyId: parseNumericId(payload.academy_id ?? payload.academyId),
    page: parseNumericId(payload.page ?? payload.pageNumber),
    pageSize: parseNumericId(
      payload.page_size ?? payload.pageSize ?? payload.per_page ??
        payload.perPage ?? payload.limit,
    ),
  };
};

const sanitizePage = (value: number | null | undefined): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return 1;
};

const sanitizePageSize = (value: number | null | undefined): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(value, MAX_PAGE_SIZE);
  }
  return DEFAULT_PAGE_SIZE;
};

const resolvePagination = (filters: FiltersInput): PaginationMeta => {
  const pageSize = sanitizePageSize(filters.pageSize);
  const page = sanitizePage(filters.page);
  const rangeStart = (page - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;
  return { page, pageSize, rangeStart, rangeEnd };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUuid = (value: string | null | undefined): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

const encodeOrValue = (value: string): string => {
  if (
    value.includes(",") || value.includes("(") || value.includes(")") ||
    value.includes('"')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const fetchUserIdsByName = async (search: string): Promise<string[]> => {
  const trimmed = search.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const { data, error } = await getServiceRoleClient()
    .from("user_preferences")
    .select("user_id")
    .ilike("full_name", `%${trimmed}%`)
    .limit(MAX_NAME_MATCHES);

  if (error) {
    throw new HttpError(500, NAME_SEARCH_FAILURE_COPY, {
      reason: "name_search_failed",
      details: error.message,
    });
  }

  return (data ?? [])
    .map((row) => (typeof row.user_id === "string" ? row.user_id : null))
    .filter((userId): userId is string =>
      Boolean(userId) && isValidUuid(userId)
    );
};

const buildSearchClause = (
  search: string | null,
  matchingUserIds: string[],
): string | null => {
  if (!search) {
    return null;
  }
  const trimmed = search.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const wildcard = encodeOrValue(`%${trimmed}%`);
  const conditions = [`email.ilike.${wildcard}`];
  if (isValidUuid(trimmed)) {
    conditions.push(`user_id.eq.${trimmed}`);
  }
  if (matchingUserIds.length > 0) {
    conditions.push(`user_id.in.(${matchingUserIds.join(",")})`);
  }
  return conditions.join(",");
};

const resolveSearchClause = async (
  search: string | null,
): Promise<string | null> => {
  if (!search) {
    return null;
  }
  if (search.includes("@")) {
    return buildSearchClause(search, []);
  }
  const matchingUserIds = await fetchUserIdsByName(search);
  return buildSearchClause(search, matchingUserIds);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseMemberRow = (row: unknown): MemberRow | null => {
  if (!isPlainObject(row)) {
    return null;
  }
  const id = typeof row.id === "number" ? row.id : Number(row.id);
  const academyId = typeof row.academy_id === "number"
    ? row.academy_id
    : Number(row.academy_id);
  if (!Number.isFinite(id) || !Number.isFinite(academyId)) {
    return null;
  }
  const email = typeof row.email === "string" ? row.email : null;
  const role = typeof row.role === "string" ? row.role : null;
  const status = typeof row.status === "string" ? row.status : null;
  if (!email || !role || !status) {
    return null;
  }
  return {
    id,
    academy_id: academyId,
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    email,
    role,
    status,
    subscription_start_date: typeof row.subscription_start_date === "string"
      ? row.subscription_start_date
      : null,
    subscription_end_date: typeof row.subscription_end_date === "string"
      ? row.subscription_end_date
      : null,
    created_at: typeof row.created_at === "string"
      ? row.created_at
      : new Date().toISOString(),
    updated_at: typeof row.updated_at === "string"
      ? row.updated_at
      : new Date().toISOString(),
  };
};

const parsePreferenceRow = (row: unknown): PreferenceRow | null => {
  if (!isPlainObject(row)) {
    return null;
  }
  const userId = typeof row.user_id === "string" ? row.user_id : null;
  if (!userId) {
    return null;
  }
  return {
    user_id: userId,
    full_name: typeof row.full_name === "string" ? row.full_name : null,
  };
};

const parseAliasRow = (row: unknown): AliasConflictRow | null => {
  if (!isPlainObject(row)) {
    return null;
  }
  const membershipId = typeof row.membership_id === "number"
    ? row.membership_id
    : Number(row.membership_id);
  const emailLogin = typeof row.email_login === "string"
    ? row.email_login
    : null;
  const emailMembership = typeof row.email_membership === "string"
    ? row.email_membership
    : null;
  const detectedAt = typeof row.detected_at === "string"
    ? row.detected_at
    : null;
  if (
    !Number.isFinite(membershipId) || !emailLogin || !emailMembership ||
    !detectedAt
  ) {
    return null;
  }
  return {
    membership_id: membershipId,
    email_login: emailLogin,
    email_membership: emailMembership,
    detected_at: detectedAt,
  };
};

async function fetchMemberships(
  academyId: number,
  filters: FiltersInput,
  searchClause: string | null,
): Promise<PaginatedMemberships> {
  const pagination = resolvePagination(filters);
  let query = getServiceRoleClient()
    .from("academy_memberships")
    .select(MEMBERSHIP_FIELDS.join(","), { count: "exact", head: false })
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.role) {
    query = query.eq("role", filters.role);
  }
  if (searchClause) {
    query = query.or(searchClause);
  }

  const { data, error, count } = await query.range(
    pagination.rangeStart,
    pagination.rangeEnd,
  );
  if (error) {
    throw new HttpError(500, MEMBERS_QUERY_FAILURE_COPY, {
      reason: "membership_query_failed",
      details: error.message,
    });
  }

  const rows = (data ?? [])
    .map((row) => parseMemberRow(row))
    .filter((row): row is MemberRow => Boolean(row));
  return {
    rows,
    total: typeof count === "number" ? count : rows.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

async function fetchPreferences(
  userIds: string[],
): Promise<Map<string, string | null>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const uniqueIds = Array.from(new Set(userIds));
  const { data, error } = await getServiceRoleClient()
    .from("user_preferences")
    .select("user_id, full_name")
    .in("user_id", uniqueIds);

  if (error) {
    throw new HttpError(500, PREFERENCES_QUERY_FAILURE_COPY, {
      reason: "preferences_query_failed",
      details: error.message,
    });
  }

  const entries = (data ?? [])
    .map((row) => parsePreferenceRow(row))
    .filter((row): row is PreferenceRow => Boolean(row))
    .map((row) => [row.user_id, row.full_name] as const);

  return new Map(entries);
}

async function fetchAliasConflicts(
  membershipIds: number[],
): Promise<Map<number, AliasConflictRow>> {
  if (membershipIds.length === 0) {
    return new Map();
  }
  const uniqueIds = Array.from(new Set(membershipIds));
  const { data, error } = await getServiceRoleClient()
    .rpc("list_open_membership_alias_conflicts", {
      p_membership_ids: uniqueIds,
    });

  if (error) {
    throw new HttpError(500, ALIAS_QUERY_FAILURE_COPY, {
      reason: "alias_query_failed",
      details: error.message,
    });
  }

  const rawRows: unknown[] = Array.isArray(data) ? data : [];
  const rows = rawRows
    .map((row) => parseAliasRow(row))
    .filter((row): row is AliasConflictRow => Boolean(row));

  return new Map(rows.map((row) => [row.membership_id, row]));
}

function normalizeMembers(
  rows: MemberRow[],
  preferences: Map<string, string | null>,
  aliases: Map<number, AliasConflictRow>,
): NormalizedMember[] {
  return rows.map((row) => {
    const alias = aliases.get(row.id);
    const fullName = row.user_id ? preferences.get(row.user_id) ?? null : null;
    return {
      ...row,
      full_name: fullName,
      has_alias_conflict: Boolean(alias),
      alias_conflict: alias
        ? {
          email_login: alias.email_login,
          email_membership: alias.email_membership,
          detected_at: alias.detected_at,
        }
        : null,
    };
  });
}

async function fetchCounts(
  academyId: number,
  filters: FiltersInput,
  searchClause: string | null,
): Promise<MembersCount> {
  const counts: MembersCount = {
    total: 0,
    awaiting_login: 0,
    active: 0,
    inactive: 0,
  };
  const statuses: Array<"awaiting_login" | "active" | "inactive"> = [
    "awaiting_login",
    "active",
    "inactive",
  ];
  const promises = statuses.map(async (status) => {
    let query = getServiceRoleClient()
      .from("academy_memberships")
      .select("id", { count: "exact", head: true })
      .eq("academy_id", academyId);

    if (filters.role) {
      query = query.eq("role", filters.role);
    }
    if (filters.status) {
      query = query.eq("status", filters.status);
    }
    if (searchClause) {
      query = query.or(searchClause);
    }

    query = query.eq("status", status);
    const { count, error } = await query;
    if (error) {
      throw new HttpError(500, MEMBERS_QUERY_FAILURE_COPY, {
        reason: "membership_count_failed",
        details: error.message,
      });
    }
    const safeCount = typeof count === "number" ? count : 0;
    if (status === "awaiting_login") {
      counts.awaiting_login = safeCount;
    } else if (status === "active") {
      counts.active = safeCount;
    } else if (status === "inactive") {
      counts.inactive = safeCount;
    }
  });

  await Promise.all(promises);
  counts.total = counts.awaiting_login + counts.active + counts.inactive;
  return counts;
}

function buildErrorResponse(
  requestId: string,
  error: unknown,
  headers: Record<string, string>,
): Response {
  const payload = buildPublicErrorPayload(requestId, error, {
    fallbackError: MEMBERS_QUERY_FAILURE_COPY,
  });
  if (!isHttpError(error)) {
    console.error("[admin-list-members] unexpected_error", {
      request_id: requestId,
    });
  }
  return new Response(JSON.stringify(payload.body), {
    status: payload.status,
    headers,
  });
}

async function handler(req: Request): Promise<Response> {
  const baseHeaders = createCorsHeaders(req);
  if (req.method === "OPTIONS") {
    try {
      ensureAllowedOrigin(req);
      return new Response("ok", { headers: baseHeaders });
    } catch (error) {
      return buildErrorResponse("preflight", error, baseHeaders);
    }
  }

  const jsonHeaders = { ...baseHeaders, "Content-Type": "application/json" };
  const { requestId } = await resolveRequestId(req.headers);
  try {
    ensureAllowedOrigin(req);

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ request_id: requestId, error: "Method not allowed" }),
        {
          status: 405,
          headers: jsonHeaders,
        },
      );
    }

    const authContext = await authenticateAdminRequest(req);
    const actorContext = resolveAdminActorContext(authContext);

    if (!actorContext.actorAcademyId && !actorContext.actorIsPlatformAdmin) {
      throw new HttpError(403, ACTIVE_ACADEMY_REQUIRED_COPY);
    }

    const filters = parseFilters(await req.json().catch(() => ({})));

    const resolvedAcademyId = actorContext.actorAcademyId ??
      (actorContext.actorIsPlatformAdmin ? filters.academyId ?? null : null);

    if (resolvedAcademyId === null) {
      throw new HttpError(400, ACADEMY_ID_REQUIRED_COPY);
    }

    const searchClause = await resolveSearchClause(filters.search ?? null);
    const memberships = await fetchMemberships(
      resolvedAcademyId,
      filters,
      searchClause,
    );
    const preferences = await fetchPreferences(
      memberships.rows
        .map((row) => row.user_id)
        .filter((userId): userId is string => Boolean(userId)),
    );
    const aliasConflicts = await fetchAliasConflicts(
      memberships.rows.map((row) => row.id),
    );
    const normalized = normalizeMembers(
      memberships.rows,
      preferences,
      aliasConflicts,
    );

    const counts = await fetchCounts(resolvedAcademyId, filters, searchClause);
    const totalPages = memberships.pageSize > 0
      ? Math.ceil(memberships.total / memberships.pageSize)
      : 0;

    console.info("[admin-list-members] success", {
      request_id: requestId,
      member_count: normalized.length,
      page: memberships.page,
      total_member_count: memberships.total,
    });

    return new Response(
      JSON.stringify({
        request_id: requestId,
        academy_id: resolvedAcademyId,
        members: normalized,
        counts,
        pagination: {
          page: memberships.page,
          page_size: memberships.pageSize,
          total_members: memberships.total,
          total_pages: totalPages,
        },
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (error) {
    return buildErrorResponse(requestId, error, jsonHeaders);
  }
}

if (import.meta.main) {
  serve(handler);
}

export const __testing = {
  parseFilters,
  parseMemberRow,
  parsePreferenceRow,
  parseAliasRow,
  normalizeMembers,
  resolvePagination,
  fetchCounts,
  resolveSearchClause,
};
