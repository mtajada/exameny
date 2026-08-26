# Public demo walkthrough

Exameny's public demo runs without an account, hosted database, analytics, API
key, or model call. It uses original fixtures and fictional identities.

```sh
npm ci --ignore-scripts
cp .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/demo`.

## What to inspect

- `/demo`: eight original language-use and reading activity types.
- `/demo/roles`: learner, teacher, and academy workflows using synthetic data.
- `/demo/speaking`: a deterministic speaking rehearsal. The learner speaks
  aloud and types a short transcript; the demo records no audio.

![Original activity demo](../output/playwright/exameny-demo-overview.png)

![Academy workflow with synthetic data](../output/playwright/exameny-demo-roles-academy.png)

![Speaking rehearsal without microphone access](../output/playwright/exameny-demo-speaking.png)

## Verification record

On 2026-08-26, the three routes were inspected at a 1440-by-1000 viewport with
the Playwright CLI. Activity switching, role tabs, rehearsal setup, and one
synthetic transcript turn worked. The browser reported no warnings or errors,
and no request left localhost.

Repeat the automated boundary check with:

```sh
npx playwright install chromium
npm run test:e2e:demo
```

The test fails if the static demo contacts a non-local origin.

Hashes and the dated browser record are in the
[demo validation evidence](../evidence/demo/VALIDATION.md).
