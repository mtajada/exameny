# Dependency and package review

Date: 2026-08-26

## Results

- `npm ci --ignore-scripts` is the required CI and clean-clone install path.
- `npm audit --audit-level=moderate`: zero known vulnerabilities.
- `npm audit --omit=dev --audit-level=moderate`: zero known production
  vulnerabilities.
- `npm run licenses:check`: every production dependency matched the explicit
  allowlist in `package.json`.
- `npm run package:check`: 613 publishable files. The dry run contained the
  required source, migrations, docs, and configuration, and no local
  environment, Git, build, test-result, Vercel-state, or agent-state path. The
  gate also rejects private
  absolute home paths, temporary implementation-assurance output, Playwright
  control state, and accidental duplicate filenames with a ` 2` suffix.
- `npm run sbom`: generated a CycloneDX SBOM successfully. CI regenerates and
  uploads it as an artifact; the generated file is not committed.

## Reproducibility

An isolated-copy gate was also run from only the 616 candidate repository
files, before any Git history existed. The target initially contained no
`node_modules`, `dist`, or `.git` directory. `npm ci --ignore-scripts` installed
1,024 packages and reported zero vulnerabilities. The isolated copy then
passed:

- lint, typecheck, 204 web tests, and the production build;
- clean-room content, database migration/seed/RLS/RPC checks, and generated
  database types;
- the 24-case Luna dry run, seven log-privacy regressions, and environment
  validation;
- Deno format, lint, check, and 329 Edge tests;
- Secretlint, production-license review, package review, production audit, and
  the Chromium demo E2E test;
- a Gitleaks `8.30.1` scan with zero leaks.

All 616 candidate file hashes still matched the source manifest after the gate.
This is strong clean-checkout evidence without claiming that a Git clone exists;
the actual clean-clone and history scans remain release gates after the new
history is created.

- `package-lock.json` SHA-256:
  `38dfe559245c7e71164ee888300a04251305f6d108b04debc9552760f1688d3d`.
- local SBOM SHA-256 for this review:
  `2b4f10d65d3223b5ac9ff4af1a743549efea4f0000f25fb03002dcfd653212e7`.

These results are a dated registry snapshot, not a promise that future
advisories will remain empty. Dependabot, CodeQL, npm audit, the lockfile, and
the release checklist form the ongoing maintenance control.
