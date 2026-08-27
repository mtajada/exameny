# Public-history validation

Date: 27 August 2026
Code candidate: `294db1f6035f8e6a249087cae1c2b00a95718dff`

The clean public history starts at
`338682bf1bfa284152acdcfc65261f3ed7904aa1`. The root commit contains 618
tracked files and imports no private Git history. The reviewed code candidate
contains 628 tracked files across 11 commits.

## History and publication boundary

- Gitleaks 8.30.1 scanned all 11 commits, about 4.88 MB, and found no leaks.
- A separate directory scan covered about 6.16 MB of the clean candidate and
  found no leaks. Credentials generated temporarily by the disposable local
  Supabase stack were truncated before this tree scan and are not tracked.
- Secretlint passed over the candidate.
- The tracked tree contains no excluded examination-brand references.
- The tracked tree contains no maintainer email, expired project email, local
  home path, OpenAI organization or project ID, or environment file other than
  `.env.example`.
- The tracked tree contains no symlink and no file larger than 5 MB.

## Clean clone

An isolated `git clone --no-local` checked out the code candidate. From that
clone:

- `npm ci --ignore-scripts` installed 1,024 packages and reported zero known
  vulnerabilities;
- lint, TypeScript, 50 Vitest files with 215 tests, and the production build
  passed;
- content, Luna, database, generated-type, privacy, Deno, Secretlint, license,
  audit, package, and demo gates passed;
- the package boundary contained 625 publishable files;
- a disposable Supabase stack rebuilt all four migrations and synthetic seed;
- the seven authenticated Auth, RLS, Edge, onboarding, academy, and mistakes
  browser flows passed serially in 13.3 seconds.

The authenticated suite is intentionally serial because its files share one
ephemeral backend. An exploratory parallel run exposed an Auth setup race;
`playwright.config.ts` now fixes the worker count at one and the complete suite
passes through the same command used by CI.

## Model evidence

The canonical live report is
`evals/luna/results/luna-2026-08-26-run5.json`, SHA-256
`ba7cbce6eccf176ba9138314b07a1c968c3ecb6a3b226bedd0f58245187c0a6e`.
It passed the project release gates with 22/24 quality cases, 8/8 adversarial
safety checks, 24/24 strict structured outputs, p95 latency of 6.32 seconds,
and measured and accounted cost of USD 0.0099058.

A bounded adapter smoke was repeated on 27 August through the product's shared
Responses API transport. It completed with `gpt-5.6-luna`, strict structured
output, 75 tokens, and 2,579 ms latency. No credential, response body, provider
ID, or learner content was retained.

All earlier Luna reports remain in the repository. Manual review superseded one
automated pass after finding leaked role/tool-like text, which led to stricter
leakage assertions and regression tests.
