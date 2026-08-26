# Public demo validation

Date: 2026-08-26
Target: local Vite server at `http://127.0.0.1:8080`
Browser route: Playwright CLI with a fresh local session

## Manual browser flow

- `/demo` loaded all eight original activity types.
- `/demo/roles` switched between learner, teacher, and academy views.
- `/demo/speaking` started a rehearsal and accepted one fictional transcript
  turn without microphone or audio access.
- The browser reported zero warnings and zero errors.
- No request left localhost.

## Automated boundary

`npm run test:e2e:demo` passed in Chromium. The test rejects any request outside
the local origin.

## Reviewed screenshots

- `output/playwright/exameny-demo-overview.png`
  SHA-256: `6aacd801e833db9fc1a7847aa8de10bdd8c3c1a12fdca169ec8b992c2c1f9ab6`
- `output/playwright/exameny-demo-roles-academy.png`
  SHA-256: `77ae10a07601985b3e81830d12ebe7fd3676d2c215950d9802358f947012edbc`
- `output/playwright/exameny-demo-speaking.png`
  SHA-256: `413fff2fc2714aab0b731bd4f9a24a00fc7b2e71dbaa24acf403d272aebbc843`

All visible identities, counts, activities, and transcript text are synthetic.
The screenshots contain no signed-in account, provider dashboard, production
identifier, or credential.
