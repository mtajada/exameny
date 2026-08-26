const DEFAULT_SITE_URL = "http://127.0.0.1:8080";

export interface InvitationRedirectOptions {
  membershipId?: number | null;
  academyId?: number | null;
}

export function buildInvitationRedirect(
  siteUrl: string | null | undefined,
  options: InvitationRedirectOptions,
) {
  const baseUrl = `${siteUrl || DEFAULT_SITE_URL}/auth`;
  const params = new URLSearchParams();

  const membershipId = typeof options.membershipId === "number" &&
      Number.isFinite(options.membershipId)
    ? options.membershipId
    : null;
  if (membershipId !== null) {
    const membershipIdString = membershipId.toString();
    params.set("p_membership_id", membershipIdString);
    params.set("membership_id", membershipIdString);
  }

  const academyId =
    typeof options.academyId === "number" && Number.isFinite(options.academyId)
      ? options.academyId
      : null;
  if (academyId !== null) {
    params.set("academy_id", academyId.toString());
  }

  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

export function buildInvitationRedirectWithFallback(
  siteUrl: string | null | undefined,
  hint: { id?: number | null; academy_id?: number | null } | null | undefined,
  fallbackAcademyId: number | null | undefined,
) {
  const membershipId = typeof hint?.id === "number" && Number.isFinite(hint.id)
    ? hint.id
    : null;
  const academyIdHint =
    typeof hint?.academy_id === "number" && Number.isFinite(hint.academy_id)
      ? hint.academy_id
      : null;
  const academyId = academyIdHint ??
    (typeof fallbackAcademyId === "number" && Number.isFinite(fallbackAcademyId)
      ? fallbackAcademyId
      : null);

  return buildInvitationRedirect(siteUrl, { membershipId, academyId });
}

export { DEFAULT_SITE_URL };
