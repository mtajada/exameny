# Database validation evidence

Date: 2026-08-26

## Passed locally

- `npm run db:types:check`: generated public types match both migrations and
  the recorded provenance.
- `npm run db:check`: two migrations applied twice and the synthetic seed
  applied twice.
- 32 public tables; RLS enabled on all 32.
- no table or function privileges for `anon` or `PUBLIC`.
- one non-exposed `private` schema with three internal tables and no grants to
  Data API roles.
- service-only RPC grants rejected `authenticated` and accepted `service_role`.
- smoke coverage for writing, language-use, Speaking, evaluation persistence,
  transcript persistence, role migration, alias resolution, metadata sync, and
  membership reset.
- an Auth-user deletion request fails with `AUTH_USER_DELETE_UNSUPPORTED`;
  reset preserves the Auth user and returns the metadata targets to synchronize.
- `npm run edge:fmt:check`, `npm run edge:check`, `npm run edge:lint`, and
  `npm run edge:test`: passed; the final Edge suite contained 329 tests.
- `npm audit --audit-level=high`: zero known vulnerabilities at validation time.

## Reproducibility record

- Supabase CLI pinned by the project: `2.115.0`.
- type generator: `@supabase/postgres-meta@0.98.0`.
- PostgREST contract version: `13.0.5`.
- initial migration SHA-256:
  `046e394bac165209a984ac29f3f1ff79f2aefaabb9b451b54084935513ba3693`.
- administrative runtime migration SHA-256:
  `401702184b2f4409801ce493f5a53e3cf289c8b43981de4c707cf93b74589367`.
- generated public types SHA-256:
  `f9ce510ba8bc84da538c431f58e0dfafc48bf8cd8a0c7aa23a7bca710128a7ce`.

The generation runtime was temporary and removed after the hashes were
recorded. No hosted project was linked and no remote database was queried.

## Release gate still requiring public CI

This host does not provide Docker or Podman, so it cannot run the complete
official local stack. `.github/workflows/integration.yml` is prepared to run:

```sh
supabase start
supabase db reset --local
supabase db lint --local
supabase functions serve --env-file supabase/.env.ci
npm run test:e2e
```

The first release remains blocked until that workflow passes in the public
repository. A passing Vite build or embedded PostgreSQL test is not presented as
hosted Auth/PostgREST/Edge evidence.
