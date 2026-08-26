# Release process

Only a maintainer with release permission may publish a tag or GitHub release. A release candidate must come from the public repository and pass from a clean clone.

Use [the repository checklist](../.github/RELEASE_CHECKLIST.md) as the release
issue body and attach evidence for each checked item.

## 1. Define the release

- choose the version and list included issues;
- state user-visible changes and known limits;
- identify database or environment changes;
- confirm who will prepare and review the candidate.

Use semantic versioning after the project publishes its first stable compatibility contract. Pre-1.0 releases may change interfaces, but release notes must describe those changes.

## 2. Run release gates

### Rights and privacy

- confirm code and contributor rights;
- verify clean-room authorship records;
- scan for protected third-party material;
- scan the working tree and full public history for credentials, personal data, production identifiers, and private documents;
- confirm the license, notices, and trademark policy.

### Reproducibility and quality

- install dependencies from the lockfile in a clean clone;
- create the database from migrations and synthetic seed;
- run lint, typecheck, unit tests, Edge Function tests, and build;
- run a browser smoke test across learner, teacher, and academy roles;
- test denied cross-academy access;
- run dependency, secret, and license scanners.

### AI evidence

- run the versioned clean-room evaluation suite;
- record quality decisions, latency, token use, and cost method;
- check the model and prompt identifiers in the report;
- list known failures and confirm the release criteria pass.

## 3. Review the candidate

Attach the check outputs or permanent CI links to the release issue. Review the exact commit, repository, tag, notes, and artifacts. If a gate fails, fix it and create a new candidate.

Required GitHub checks are `Web application`, `Edge Functions`,
`Auth, RLS, Edge and role smoke tests`, `Secretlint`, `Gitleaks`, and
`JavaScript and TypeScript`. Review Dependabot alerts and the uploaded CycloneDX
SBOM as part of the candidate.

## 4. Publish

Immediately before any external action, review the exact `mtajada/exameny`
repository, full commit SHA, tag, files, release notes, account, and command.
Publication needs a fresh maintainer approval at that point.

Create the tag from the reviewed commit. Publish the GitHub release with install
notes, migrations, compatibility notes, known issues, and links to the
evaluation and security policy. Enable private vulnerability reporting and
verify it from the public repository settings.

Deploying the demo is a separate action. Point it only at dedicated public-demo services with synthetic data.

## 5. Verify

- fetch the public tag into a new directory;
- repeat install and build from the published source;
- verify release assets and checksums;
- run the public demo smoke test;
- confirm documentation links and vulnerability reporting work;
- record the result in the release issue.

## Failed release or rollback

Do not reuse a broken tag. Publish a corrected version and explain the impact. Revoke any exposed credential at its provider before changing repository history or artifacts. If a deployed release risks user data or tenant isolation, disable the affected feature or deployment while maintainers prepare the fix.
