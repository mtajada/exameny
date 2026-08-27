# Security and privacy review

Date: 2026-08-27
Scope: the sanitized public snapshot, including React/Vite, Supabase migrations,
Edge Functions, deployment configuration, CI, fixtures, and dependency policy.

## Executive result

No known Critical or High finding remains open in the reviewed snapshot. Six
issues found during the review were corrected before publication. The remaining
items below are explicit operational or architectural limits, not claims that a
deployed instance has already been penetration-tested.

## Resolved findings

### SR-01 — learner content, identifiers, and raw errors in production logs

- Severity before fix: High in browser logs and Medium in operator-only Edge
  logs.
- Scope: a final AST audit covered 367 production TypeScript and TSX files. It
  found browser and Edge logging of task prompts, drafts, rows, emails,
  membership and submission identifiers, raw errors, and unbounded helper
  arguments. The initial pass changed 145 calls in 48 files. A stricter second
  pass rejected camelCase and snake_case identifiers plus every unknown dynamic
  value; it classified and resolved 31 residual arguments and extended the
  remediation to six additional files, for 54 production files in total.
- Resolution: production logs now use fixed event labels plus safe request IDs,
  normalized failure codes, durations, status codes, and aggregate counts.
  The only metadata families added to the strict allowlist in the second pass
  were numeric timeout and layout-overflow measurements. Logger helpers retain
  a constant call-site event label but discard their payload. The same
  learner-text diagnostic object was also removed from its validation-exception
  message so it cannot escape through a downstream error channel.
  `scripts/check-log-privacy.mjs` now rejects sensitive identifiers, raw
  payloads, error objects, spread arguments, unknown dynamic values, and
  dynamic helper event labels. Its seven regression tests and the full
  367-file scan pass through
  `npm run privacy:logs` in CI.

### SR-02 — personal data in optional analytics events

- Severity before fix: Medium.
- Location: `src/pages/AuthPage.tsx`.
- Evidence: Magic Link events included the email domain and authentication
  events included raw provider error messages.
- Resolution: `src/lib/analytics.ts` makes telemetry opt-in and accepts only
  curated, low-cardinality properties. Email domains, free text, identifiers,
  and raw errors are no longer sent.

### SR-03 — unvalidated OAuth navigation target

- Severity before fix: Medium.
- Location: `src/pages/AuthPage.tsx`.
- Evidence: the browser navigated directly to the URL returned by the Auth SDK.
- Resolution: `isTrustedSupabaseAuthUrl` now requires the configured Supabase
  origin and an `/auth/v1/` path. Unit tests reject a foreign origin,
  `javascript:` URL, and a non-Auth path.

### SR-04 — unnecessary HTML parser sink in chart styles

- Severity before fix: Low because the component had no user-controlled caller.
- Location: `src/components/ui/chart.tsx`.
- Evidence: chart CSS used `dangerouslySetInnerHTML`.
- Resolution: the stylesheet is now a React text child. The two remaining HTML
  render paths are limited to the exercise formatter: input is escaped by
  `src/utils/reading-format.ts`, only project-generated structural tags are
  added, and injection behaviour has a regression test.

### SR-05 — local fixture and failure-artifact boundary

- Severity before fix: High if a hosted Edge runtime could enable deterministic
  evaluation fixtures; Medium for over-broad CI failure artifacts.
- Resolution: fixture mode now requires a recognized loopback or Supabase CLI
  internal URL, `APP_ENV=development`, and the explicit fixture flag. Hosted
  Supabase URLs and lookalike hosts are rejected by regression tests. CI turns
  traces and videos off and retains only error context, screenshots, and the
  local function log on failure.

### SR-06 — evaluation payload consistency

- Severity before fix: High because a service request could persist internally
  contradictory legacy rows, V2 items, metrics, or summaries.
- Resolution: the service-only RPC now derives and validates resolution counts,
  category and tag IDs, summaries, anchored legacy mappings, and JavaScript
  UTF-16 offsets in one transaction. Contradictory payloads roll back without
  replacing the last valid analysis.

## Verified controls

- browser-exposed variables are restricted to `VITE_SUPABASE_URL`, a Supabase
  publishable key, feature flags, and analytics consent; OpenAI and Supabase
  secret keys remain server-only;
- OpenAI Responses requests set `store: false`, use strict structured outputs,
  validate the parsed contract, and do not fall back to a browser provider;
- hosted CORS has no wildcard or permissive fallback: an explicit
  `ALLOWED_ORIGINS` value is required outside localhost;
- every public database table has RLS; internal operational tables live in a
  non-exposed `private` schema and service-only RPCs have explicit grants plus
  runtime role assertions;
- Speaking session creation and DML require the learner's own active student
  membership; teacher and academy-admin roles are denied by both RPC and RLS;
- uploaded images are allowlisted to JPEG/PNG/WebP, bounded by size in the
  browser and Edge Function, and are not rendered as active content;
- Markdown uses React rendering without raw-HTML plugins; printable Markdown
  additionally sets `skipHtml`;
- no remote script or stylesheet is loaded by `index.html`;
- `vercel.json` declares CSP, clickjacking protection, `nosniff`, referrer and
  permissions policies;
- CI uses the lockfile, `npm ci --ignore-scripts`, the production-log privacy
  gate, CodeQL, Dependabot, Secretlint, Gitleaks, dependency audit, license
  review, and SBOM generation.

## Local secret-scan evidence

- Secretlint passed over the candidate tree.
- Gitleaks `8.30.1` scanned all 11 local public-history commits (about 4.88 MB)
  and the clean candidate directory (about 6.16 MB) with the repository's
  default-extending configuration; both reported zero leaks.
- Public CI must repeat the history scan after push.

## Residual risks and required operator actions

1. The SPA uses Supabase's persistent browser session storage. A successful XSS
   could therefore expose a session. The repository minimizes that likelihood
   through escaped rendering, no remote scripts, a CSP, short token lifetime,
   and refresh-token rotation. A future BFF/HTTP-only-cookie architecture would
   reduce this residual risk further.
2. The generic self-hosting CSP permits any HTTPS image and any Supabase-hosted
   connection, and allows inline styles for the current UI stack. A production
   operator should narrow these sources to its own project and asset hosts.
3. Operational outbox and alias records can contain personal data by design.
   They are private and ungranted, but each deployment must set retention,
   access, deletion, and backup rules under its own data-protection obligations.
4. Repository header configuration must be verified against the live response
   after deployment. Configuration evidence is not runtime evidence.
5. The disposable local Auth/PostgREST/Edge stack passed all seven browser
   flows. Hosted CI must reproduce that result before release; no existing
   hosted project was used as a substitute.
6. Gitleaks passed locally over the complete candidate history and tree. The
   public secret-scan workflow must reproduce it after push.

## Review boundary

The review combined AST-based production-log analysis, targeted source
searches, the project test suites, database grant/RLS checks, Edge tests,
dependency and secret scans, and a localhost demo that rejects remote requests.
It did not test a production deployment, inspect real user data, or disclose
any credential.
