# Exameny agent guide

These rules apply to the whole repository.

## Project and identity

- Expected GitHub owner and repository: `mtajada/exameny`.
- Expected local Git identity: the maintainer's verified `PERSONAL` profile; do
  not use a work or organization email.
- Use the maintainer's personal GitHub CLI route for this repository. Do not
  repoint an unrelated organization connector or reuse another project's cloud
  credentials.
- Show the exact repository, commit, tag, release, deployment, message, or form
  before any external write and obtain a fresh maintainer approval.

Before a Git or GitHub action, run:

```sh
pwd
git rev-parse --show-toplevel
git remote -v
git config user.email
gh auth status
```

## Content and rights

- Author educational material from general competencies and learning objectives.
- Never copy, paraphrase, trace, translate, transcribe, transform, or prompt from
  an examination-provider question, answer key, rubric, handbook, scan, or logo.
- Add provenance for new exercises, prompts, learner samples, rubrics, and model
  fixtures.
- Preserve the AGPL, CC BY, third-party notice, and trademark boundaries.

## Privacy and infrastructure

- Use synthetic accounts and submissions in code, docs, tests, demos, and reports.
- Never commit a credential, production identifier, private URL, user export,
  document, log, or provider response ID.
- Keep AI keys and Supabase secret keys server-side. A `VITE_*` variable is public.
- Run authenticated tests only against loopback Supabase. Do not link or deploy to
  a hosted project without an explicit, reviewed action.

## Architecture

- Preserve RLS and tenant checks; client route guards are not authorisation.
- Put privileged mutations and provider calls in Edge Functions.
- Add a migration for every database contract change and regenerate types from
  the complete migration set.
- OpenAI calls use `gpt-5.6-luna`, Responses API, `store: false`, strict schemas,
  runtime parsing, bounded timeouts, and no silent fallback.
- Do not log prompts, learner text, model output, credentials, raw error bodies,
  or provider response IDs.

## Required checks

Run the relevant focused test while working. Before a release, run the complete
checklist in `.github/RELEASE_CHECKLIST.md`, including:

```sh
npm run lint:fix
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e:demo
npm run content:check
npm run db:check
npm run db:types:check
npm run eval:luna:verify
npm run smoke:openai-adapter -- --confirm-live-adapter-smoke
npm run edge:fmt:check
npm run edge:lint
npm run edge:check
npm run edge:test
npm run security:secrets
npm run licenses:check
```

Do not describe work as complete until implementation and verification both pass.
Record known limitations instead of weakening a test or quality gate.
