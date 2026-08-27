# Dependency and package review

Date: 2026-08-27
Code candidate: `294db1f6035f8e6a249087cae1c2b00a95718dff`

## Results

- `npm ci --ignore-scripts` installed 1,024 locked packages in a fresh clone and
  reported zero known vulnerabilities.
- `npm audit --audit-level=moderate` and
  `npm audit --omit=dev --audit-level=moderate` both reported zero
  vulnerabilities.
- `npm run licenses:check` matched every production dependency against the
  explicit allowlist in `package.json`.
- `npm run package:check` passed with 625 publishable files, 1,404,314 packed
  bytes, and 4,749,852 unpacked bytes. The package excludes local environment,
  Git, build, test-result, Vercel-state, and agent-state paths.
- `npm run sbom` generated a CycloneDX SBOM successfully. CI regenerates it as
  a workflow artifact; the generated file is not committed.

## Clean-clone verification

The fresh clone of the code candidate passed:

- lint, TypeScript, 50 Vitest files with 215 tests, and the production build;
- 22 clean-room content files, eight activity archetypes, and six content
  tests;
- four database migrations applied twice, the synthetic seed applied twice,
  RLS/RPC checks, and generated-type provenance;
- the 24-case Luna dry run and its 15 harness tests;
- seven log-privacy regressions across 367 production files;
- Deno format across 131 files, lint across 129 files, type checks, and 331
  Edge tests;
- Secretlint, the production-license allowlist, both npm audits, the package
  boundary check, and the Chromium demo;
- a clean local Supabase rebuild, database lint, and all seven authenticated
  browser flows using one shared-stack worker;
- Gitleaks 8.30.1 over all 11 commits and over the clean candidate tree.

## Reproducibility

- `package-lock.json` SHA-256:
  `38dfe559245c7e71164ee888300a04251305f6d108b04debc9552760f1688d3d`.
- local CycloneDX SBOM SHA-256 for this review:
  `c94318cb9c0c8050ad3d5d535bf08ea9c54863ff8d847a3496345a6ed894ca17`.

The production build retains Vite's non-blocking large-chunk warning. The
locked install also reports deprecation notices for two transitive or tooling
packages. Neither produced an audit finding, but both remain maintenance items
for routine dependency updates.

These results are a dated registry snapshot, not a promise that future
advisories will remain empty. Dependabot, CodeQL, npm audit, the lockfile, and
the release checklist form the ongoing maintenance control.
