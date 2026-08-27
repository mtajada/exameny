# Database validation evidence

Date: 2026-08-27

## Passed locally

- `npm run db:types:check`: generated public types match all four migrations and
  the recorded provenance.
- `npm run db:check`: four migrations applied twice and the synthetic seed
  applied twice.
- 32 public tables; RLS enabled on all 32.
- no table or function privileges for `anon` or `PUBLIC`.
- one non-exposed `private` schema with three internal tables and no grants to
  Data API roles.
- service-only RPC grants rejected `authenticated` and accepted `service_role`.
- smoke coverage for writing, language-use, Speaking, evaluation persistence,
  transcript persistence, role migration, alias resolution, metadata sync, and
  membership reset. Evaluation persistence also covers actor and tenant
  rejection, the complete canonical mistakes taxonomy, failed-regeneration
  preservation, metric consistency, and JavaScript UTF-16 anchors.
- an Auth-user deletion request fails with `AUTH_USER_DELETE_UNSUPPORTED`;
  reset preserves the Auth user and returns the metadata targets to synchronize.
- `npm run edge:fmt:check`, `npm run edge:check`, `npm run edge:lint`, and
  `npm run edge:test`: passed; the final Edge suite contained 331 tests.
- the official local Supabase stack rebuilt successfully, passed database lint,
  served the Edge Functions, and completed all seven authenticated Playwright
  flows.
- `npm audit --omit=dev --audit-level=moderate`: zero known vulnerabilities at
  validation time.

## Reproducibility record

- Supabase CLI pinned by the project: `2.115.0`.
- type generator: `@supabase/postgres-meta@0.98.0`.
- PostgREST contract version: `13.0.5`.
- initial migration SHA-256:
  `046e394bac165209a984ac29f3f1ff79f2aefaabb9b451b54084935513ba3693`.
- administrative runtime migration SHA-256:
  `401702184b2f4409801ce493f5a53e3cf289c8b43981de4c707cf93b74589367`.
- preferences conflict migration SHA-256:
  `5c180dc32b043e70f849b7d750d6bda4cc71e10d02a561b0be69c51b6fa92b3d`.
- onboarding, taxonomy, and evaluation persistence migration SHA-256:
  `f555352650611ce2fa9658a12156720e243f3cd107712ffc36d6e0eaef62dbd9`.
- generated public types SHA-256:
  `b0be76cd7ae8c37c52a3a226ef26d05282b343f2857e03c5a2696c28d253682a`.

The generation and integration runtimes were temporary. No hosted project was
linked and no remote database was queried.

## Hosted release gate

The same reproducible workflow runs in public GitHub Actions:

```sh
supabase start
supabase db reset --local
supabase db lint --local
supabase functions serve --env-file supabase/.env.ci
npm run test:e2e
```

The release candidate still requires that hosted workflow to pass for its final
commit. Local evidence is not presented as a substitute for the public CI result.
