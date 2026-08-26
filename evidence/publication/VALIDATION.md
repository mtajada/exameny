# Public-history validation

Date: 26 August 2026

The clean public history starts at
`338682bf1bfa284152acdcfc65261f3ed7904aa1`. The root commit contains 618
tracked files and imports no private Git history.

## History and publication boundary

- Gitleaks 8.30.1 scanned the root commit and found no leaks.
- A separate directory scan covered 7.89 MB and found no leaks.
- The tracked tree contains no Cambridge, TOLES, or IELTS references.
- The tracked tree contains no maintainer email, expired project email, local
  home path, OpenAI organization or project ID, or environment file other than
  `.env.example`.
- The tracked tree contains no symlink and no file larger than 5 MB.

## Clean clone

An isolated `git clone --no-local` checked out the root commit. From that clone:

- `npm ci --ignore-scripts` installed 1,024 packages and reported zero known
  vulnerabilities;
- lint and TypeScript checks passed;
- Vitest passed 48 files and 204 tests;
- the production build completed;
- the Luna package passed 15 offline tests and its zero-network dry run;
- the package boundary check passed with 615 publishable files.

The source candidate also passed the complete web, Deno, database, demo,
Secretlint, license, npm-audit, and package gate sequence before this evidence
was recorded.

## Model evidence

The canonical live report is
`evals/luna/results/luna-2026-08-26-run5.json`, SHA-256
`ba7cbce6eccf176ba9138314b07a1c968c3ecb6a3b226bedd0f58245187c0a6e`.
It passed the project release gates with 22/24 quality cases, 8/8 adversarial
safety checks, 24/24 strict structured outputs, p95 latency of 6.32 seconds,
and measured and accounted cost of USD 0.0099058.

All earlier Luna reports remain in the repository. Manual review superseded one
automated pass after finding leaked role/tool-like text, which led to stricter
leakage assertions and regression tests.
