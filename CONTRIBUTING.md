# Contributing to Exameny

Thank you for helping learners get clearer practice and feedback. Small, well-tested changes are easier to review than broad rewrites.

## Before you start

Open an issue before changing architecture, database contracts, authentication, educational formats, or public APIs. Describe the learner or maintainer problem and the smallest change that solves it.

You can send focused bug fixes without a design issue when the expected behavior is clear.

## Content contributions

Every public exercise, prompt, rubric, explanation, and example must be original or included under a compatible license with clear attribution.

For clean-room educational content:

1. Start from a general competency or learning objective.
2. Write the source text, questions, distractors, answer, and explanation from scratch.
3. Record the author, creation date, target level, skill, and review status.
4. Check that wording, structure, names, scenarios, and answers do not derive from a protected test or teaching pack.

Do not upload screenshots, scans, transcriptions, answer keys, logos, branded rubrics, or transformed questions from an examination provider. Do not feed that material to an AI model to produce a replacement.

## Code contributions

- keep privileged operations in server-side functions;
- validate untrusted data at each network boundary;
- preserve row-level security and role checks;
- add or update tests for changed behavior;
- avoid unrelated formatting or dependency churn;
- never commit credentials, production identifiers, personal data, or real submissions.

Disclose significant AI assistance in the pull request. The contributor remains responsible for authorship, licensing, security, and correctness.

## Local setup

Use Node.js 22 and npm 11. Install the locked dependencies and validate the
safe local contract:

```sh
npm ci --ignore-scripts
cp .env.example .env.local
npm run validate:env
npm run db:check
npm run dev -- --host 127.0.0.1 --port 8080
```

The public demo at `/demo` needs no account or hosted service. An authenticated
local stack also requires the Supabase CLI and a Docker-compatible runtime; see
[`docs/development.md`](docs/development.md).

## Checks

Run the checks that apply to your change:

```sh
npm run lint:fix
npm run lint
npm run typecheck
npm run test
npm run build
```

Changes under `supabase/functions/` also require:

```sh
npm run edge:fmt:check
npm run edge:lint
npm run edge:check
npm run edge:test
```

## Pull request checklist

- [ ] The change solves the linked issue or explains why no issue was needed.
- [ ] Tests cover the changed behavior.
- [ ] User-facing text and documentation are current.
- [ ] New content includes its clean-room authorship record or compatible license.
- [ ] The change contains no secrets, personal data, production identifiers, or private URLs.
- [ ] Relevant frontend and Edge Function checks pass.
- [ ] The pull request lists known limits or follow-up work.

## Review and acceptance

A maintainer reviews security, product fit, test evidence, and licensing.
Maintainers may ask for a smaller patch or reject content whose origin cannot
be established. By contributing, you confirm that you have the right to submit
the work under the repository's licenses.
