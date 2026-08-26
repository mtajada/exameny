# Release checklist

Record evidence next to every item. A checked box without a command output, CI link, report, or reviewer note is not release evidence.

## Candidate

- [ ] Repository, branch, full commit SHA, version, tag, and release owner are recorded.
- [ ] User-visible changes and known limitations are written in plain language.
- [ ] The candidate contains only the new public Git history.

## Rights, privacy, and independence

- [ ] Code and collaborator publication rights are confirmed.
- [ ] Educational content provenance passes `npm run content:check`.
- [ ] Searches for protected provider material, private documents, personal data, production identifiers, and private URLs are clean or reviewed.
- [ ] Secretlint and Gitleaks pass on the working tree and complete public history.
- [ ] Licenses, third-party notices, trademark policy, and independence notice are current.

## Reproducibility and security

- [ ] `npm ci --ignore-scripts` passes in a clean clone.
- [ ] Environment validation, database baseline, generated types, migrations, and synthetic seed pass.
- [ ] `npm run lint:fix`, lint, typecheck, unit tests, build, and public-demo E2E pass.
- [ ] Deno formatting, lint, typecheck, and tests pass.
- [ ] Production dependency audit, license review, CodeQL, Dependabot, and SBOM gates pass.
- [ ] Tenant-denial and privileged-operation tests use only local synthetic data.

## AI evidence

- [ ] Luna offline verification passes.
- [ ] The reviewed live report identifies model, API, storage setting, fixtures, thresholds, latency, token use, cost, failures, and report hash.
- [ ] A maintainer reviews every failed case without weakening a safety gate.

## Publication and verification

- [ ] A fresh approval names the exact GitHub account, repository, commit, tag, files, release notes, and external actions.
- [ ] The public repository and release are verified from an unauthenticated view.
- [ ] The published tag installs and builds from a new clone.
- [ ] Security reporting, issue templates, documentation links, and demo work publicly.
- [ ] The release issue records the final URLs and verification evidence.
