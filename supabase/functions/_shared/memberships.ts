import { getServiceRoleClient } from "./auth.ts";
import { HttpError } from "./http-errors.ts";

interface MembershipRecord {
  user_id: string | null;
}

/**
 * Retrieves the owner of a membership so Edge Functions can refresh the correct session.
 * Throws with the provided error copy when the lookup fails or returns an unexpected state.
 */
export async function getMembershipOwnerUserId(
  membershipId: number,
  errorMessage: string,
): Promise<string> {
  const { data, error } = await getServiceRoleClient()
    .from("academy_memberships")
    .select("user_id")
    .eq("id", membershipId)
    .maybeSingle<MembershipRecord>();

  if (error) {
    throw new HttpError(500, errorMessage, {
      reason: "membership_lookup_failed",
      details: error.message,
    });
  }

  if (!data) {
    throw new HttpError(500, errorMessage, { reason: "membership_not_found" });
  }

  if (!data.user_id) {
    throw new HttpError(500, errorMessage, {
      reason: "membership_missing_user",
    });
  }

  return data.user_id;
}
