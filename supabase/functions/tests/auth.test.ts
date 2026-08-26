import { assertEquals } from "std/testing/asserts.ts";

import { shouldRequireAcademyMembership } from "../_shared/auth.ts";

Deno.test("returns false when academy requirement is disabled", () => {
  const result = shouldRequireAcademyMembership(
    { requireAcademy: false },
    "teacher",
    null,
  );
  assertEquals(result, false);
});

Deno.test("returns false when user already belongs to an academy", () => {
  const result = shouldRequireAcademyMembership(
    { requireAcademy: true },
    "teacher",
    42,
  );
  assertEquals(result, false);
});

Deno.test("returns true when academy is required and user is not exempt", () => {
  const result = shouldRequireAcademyMembership(
    { requireAcademy: true },
    "teacher",
    null,
  );
  assertEquals(result, true);
});

Deno.test("returns false when role is exempt from academy requirement", () => {
  const result = shouldRequireAcademyMembership(
    {
      requireAcademy: true,
      academyOptionalRoles: ["platform_owner", "super_admin"],
    },
    "platform_owner",
    null,
  );
  assertEquals(result, false);
});
