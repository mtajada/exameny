# Maintenance

Miguel Tajada Ferrer (`@mtajada`) is Exameny's lead and current sole maintainer.
The project is early-stage; it does not claim a contributor community or usage
figures that are not publicly verifiable.

## Routine

- Triage new bug, content, and security reports.
- Review Dependabot and CodeQL results each week.
- Keep fixtures original, synthetic, and attributable.
- Require tests and a clear risk note for pull requests.
- Review model pricing and failed evaluation cases before an AI report is used
  for a release.
- Publish release notes, migrations, known limitations, and clean-clone evidence.

The repository configures GitHub Actions for CI, CodeQL, and secret scans on
pushes and pull requests. A public run is required before the first release.
Dependabot checks npm and GitHub Actions dependencies weekly. Automation may
open a proposal or produce evidence, but it does not merge, tag, release, deploy,
or submit an external form without maintainer review.

## Triage priorities

1. Credential exposure, tenant isolation, authentication, or data-loss risk.
2. Incorrect or unsafe learner feedback with a reproducible case.
3. Broken installation, migration, build, or local demo.
4. Accessibility and educator workflow defects.
5. New features and broader content coverage.

Security reports use the private route in `SECURITY.md`. Educational-content
reports should identify the learning objective and provenance without attaching
protected exam material.

## Evidence

The public record starts with the clean repository. Relevant evidence includes
merged pull requests, issue triage, release tags and notes, CI runs, Dependabot
updates, security advisories, and reviewed evaluation reports. The roadmap marks
direction, not completed work; a feature is complete only when its issue links to
implementation and verification.

Material service credits or sponsorships that affect development will be listed
in the repository. They do not grant access to private user data or control over
security and pedagogical decisions.
