# Database reconstruction

## Clean-room baseline

The public database is a new, reviewable baseline. It is neither a production
dump nor a copy of the private migration history. Three ordered migrations rebuild
the contracts required by the full application:

1. `20260826153916_initial_public_schema.sql` creates the tenant-aware product
   model, RLS policies, public RPCs, and reference-data contracts.
2. `20260826165415_cleanroom_admin_runtime.sql` adds protected operational
   storage and the service-only RPCs used by administration, invitation, alias,
   and event flows.
3. `20260827075511_disambiguate_save_user_preferences_conflict.sql` fixes the
   runtime conflict target in `save_user_preferences` without changing its
   public signature.

The resulting surface contains 32 `public` tables. Every public table has RLS.
The internal `private` schema contains three operational tables:
`event_outbox`, `membership_alias_conflicts`, and `membership_role_audit`.
`private` is not exposed by the Data API, and `anon`, `authenticated`, and
`service_role` receive no schema or table grants there. Server code reaches it
only through narrowly granted public RPCs.

No legacy `admin` or `audit` schema is recreated.

## Security decisions

- `anon` has no table or function privileges.
- `authenticated` receives explicit table and RPC grants; it does not receive
  global function execution.
- service-only RPCs check the service role at runtime and are not executable by
  browser roles.
- every `SECURITY DEFINER` function pins an empty `search_path` and fully
  qualifies database objects.
- tenant checks use the authenticated user, active membership, academy scope,
  and role. User-editable metadata is not the authorization source.
- Auth administration remains in Edge Functions. SQL does not delete Auth
  users or silently rewrite `auth.users`; unsupported deletion requests fail
  explicitly.
- the membership reset path preserves the Auth user, removes the membership
  association, and returns an explicit metadata-sync target to the server
  layer.
- administrative role and alias operations are idempotent for sequential
  retries and write their audit record inside the same transaction.

## Portability and data rules

- email values use normalized `text` with format constraints;
- UUIDs use PostgreSQL `gen_random_uuid()`;
- synthetic seed identities use only `example.com`;
- Speaking uses memberships as the academy boundary;
- no production records, Storage objects, Auth export, hosted project reference,
  or private URL is part of the reconstruction.

## Generated client types

`src/integrations/supabase/types.ts` is generated from all public migrations,
not written by hand. `evidence/database/types-generation.json` records the
migration hashes, generator version, PostgREST version, schema selection, and
resulting type hash. `npm run db:types:check` fails when that provenance no
longer matches the checked-in migrations or types.

## Verification boundary

`npm run db:check` applies every migration twice and the synthetic seed twice in
an embedded PostgreSQL runtime. It checks RLS, grants, service-only RPCs,
administrative role changes, alias resolution, membership reset behaviour,
writing, language-use, and Speaking smoke paths.

The public GitHub integration workflow additionally starts the official local
Supabase stack, runs `supabase db reset --local` and `supabase db lint --local`,
serves Edge Functions, and executes authenticated browser smoke tests. That
hosted CI result is required before the first release; an embedded database test
does not replace PostgREST, GoTrue, or Edge Runtime verification.

Future database changes must be small forward migrations. Private migration
history and production data must never be grafted into the public repository.
