# Roadmap

The roadmap follows evidence, not dates. An item moves to done only when its issue links to code, tests, and a reproducible check.

## First public release

Prepared in the local release candidate:

- [x] Prepare the full sanitized application snapshot for a new Git history.
- [x] Remove private infrastructure, production identifiers, personal data, and credentials.
- [x] Replace educational fixtures and prompts with reviewed clean-room content.
- [x] Add versioned database migrations, synthetic seed data, and a tested local setup.
- [x] Add `.env.example` with names and safe defaults only.
- [x] Integrate `gpt-5.6-luna` through the OpenAI Responses API behind server-side boundaries.
- [x] Add a reproducible AI evaluation with quality, latency, token use, cost method, acceptance criteria, and known failures.
- [x] Configure continuous integration, dependency updates, secret scanning, and license checks.
- [x] Add the architecture, security, governance, contribution, release, and independence documents.
- [x] Verify the synthetic demo walkthrough and include reviewed screenshots.

Required before the first tag:

- [x] Confirm maintainer rights and record the collaborator-branch exclusion.
- [x] Pass install, lint, typecheck, tests, build, Edge Function checks, secret scans, and smoke tests from a clean clone.
- [ ] Pass the full Supabase integration workflow in the public repository.
- [ ] Verify the repository, documentation, demo, security reporting, and CI from an unauthenticated view.
- [ ] Obtain fresh approval for the exact repository, commit, tag, release notes, and publication actions.

## Reliability after the first release

- expand tests for role boundaries and academy isolation;
- improve accessibility coverage for onboarding, the editor, feedback, and practice flows;
- add operator-facing health checks without exposing content or personal data;
- tighten cost limits and failure handling for AI requests;
- document backup and restore for self-hosted deployments.

## Contributor growth

- label small, reproducible starter issues;
- publish the clean-room content authoring and review workflow;
- add architecture decisions for changes that affect several subsystems;
- recruit reviewers for language pedagogy, security, and accessibility as the contributor base grows.

## Outside the roadmap

The project will not reproduce branded exam papers, claim official scoring equivalence, publish private user data, or make a public demo depend on the existing production services.
