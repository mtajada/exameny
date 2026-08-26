# Development

Exameny can be inspected without an account or hosted service. The authenticated
application uses a disposable local Supabase stack. Never point local tests at a
hosted development or production project.

## Requirements

- Node.js 22 (`>=22.12.0`) and npm 11
- Deno 2.9.5 for Edge Function checks
- Chromium installed through Playwright for browser tests
- Supabase CLI and a Docker-compatible runtime for the full local stack

The fast public-demo and embedded database checks do not require Docker.

## Public demo

From a new clone:

```sh
npm ci --ignore-scripts
cp .env.example .env.local
npm run validate:env
npm run db:check
npm run content:check
npm run eval:luna:verify
npm run dev -- --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/demo`. The demo uses only bundled clean-room
fixtures. It does not sign in, call Supabase, or invoke an AI provider.

To verify that boundary automatically:

```sh
npx playwright install chromium
npm run test:e2e:demo
```

The test fails if the demo contacts a non-local host.

## Authenticated local application

Start and rebuild the disposable stack from the checked-in migration and seed:

```sh
npm run supabase:start
npm run supabase:reset
supabase status
```

Copy only the local API URL and local publishable key shown by the CLI into the
ignored `.env.local`. Put server-only values in an ignored Edge Function env
file. Do not prefix a service credential or `OPENAI_API_KEY` with `VITE_`.

Run the frontend and functions in separate terminals:

```sh
npm run dev -- --host 127.0.0.1 --port 8080
supabase functions serve --env-file supabase/.env.local
```

The seed contains fictional `@example.com` identities and original practice
data. It contains no production account or submission. The authenticated
Playwright seeder rejects any Supabase URL whose host is not `localhost`,
`127.0.0.1`, or `::1`.

```sh
npm run test:e2e
npm run supabase:stop
```

## Environment contract

`.env.example` separates browser-safe names from server-only names. Local files
matching `.env*` are ignored except for the example. CI and deployments must use
their own secret stores.

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may reach the browser.
- `VITE_ENABLE_ANALYTICS` defaults to `false`.
- when analytics is enabled, only curated event names and low-cardinality
  properties are sent; email domains, free text, IDs, and raw errors are excluded.
- `OPENAI_API_KEY` and provider credentials are server-only.
- `OPENAI_MODEL` defaults to `gpt-5.6-luna` in the documented setup.
- optional mail and distributed-rate-limit adapters may remain empty locally.

Validate the example or a private production file without printing values:

```sh
npm run validate:env
npm run validate:env:production -- --file=/absolute/private/path
```

## Quality checks

```sh
npm run lint:fix
npm run lint
npm run typecheck
npm run test
npm run build
npm run content:check
npm run eval:luna:verify
npm run db:check
npm run db:types:check
npm run security:secrets
npm run licenses:check
npm audit --omit=dev --audit-level=moderate
```

For Edge Functions:

```sh
npm run edge:fmt:check
npm run edge:lint
npm run edge:check
npm run edge:test
```

`db:check` applies the migration and seed twice in an in-memory PostgreSQL
runtime, exercises RLS/RPC contracts, and checks synthetic identities. It is a
fast regression gate, not a replacement for the full Supabase-stack test.

## Database changes

Create a versioned migration for every schema, function, trigger, index, grant,
or policy change. Verify both a fresh database and an upgrade from the latest
release. Regenerate TypeScript definitions with `npm run db:types` only after
the local Supabase stack is running, then run `npm run db:types:check`.

Review tenant isolation with two academies and each affected role. Test both the
allowed operation and the denied cross-academy operation. Keep privileged RPCs
server-only and pin `search_path` on every `SECURITY DEFINER` function.

## AI changes

Model calls belong in server-side functions. Use original synthetic fixtures and
record the model identifier, prompt and schema contract, acceptance criteria,
latency, token usage, cost method, failed cases, and reviewer decision. The Luna
runner requires a private env-file path and an explicit paid-run confirmation;
its README documents the bounded command.

Never publish a prompt, trace, screenshot, or report containing a real learner
submission, credential, provider response ID, or protected third-party content.
