# Changelog

All notable public changes to Exameny are recorded here.

## [Unreleased]

Release candidate for `0.1.0`. The date, commit, and tag will be recorded only
after the public repository passes its release gates.

### Added

- Complete learner, teacher, academy, platform, and speaking application source.
- Public local-only demo with original clean-room activities and role workflows.
- Reproducible Supabase migration, RLS policies, RPCs, and synthetic seed data.
- Server-side `gpt-5.6-luna` Responses API integration with strict outputs and
  `store: false`.
- Reproducible Luna evaluation harness and reviewed live report, including failed
  run provenance and a known pedagogical limitation.
- CI, CodeQL, Dependabot, Secretlint, Gitleaks, dependency-license review, and
  CycloneDX SBOM generation.
- Contribution, security, governance, trademark, legal, maintenance, architecture,
  development, release, and clean-room policies.

### Security and privacy

- Prepared a sanitized root for a new public Git history without copying the
  private repository.
- Removed private infrastructure bindings, historical credentials, real records,
  private documents, and unlicensed educational material.
- Kept AI and privileged database credentials behind server-only boundaries.

### Known limitations

- Exameny is maintained by one person for this candidate.
- The public model evaluation is a small synthetic regression suite, not a broad
  language benchmark or official assessment.
- Authenticated self-hosting requires the Supabase CLI and a Docker-compatible
  runtime; the public demo does not.
