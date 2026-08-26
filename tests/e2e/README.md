# Playwright end-to-end tests

The public demo test is self-contained: it starts the Vite application, uses only clean-room fixtures, and fails if the page contacts a remote host.

```sh
npx playwright install chromium
npm run test:e2e:demo
```

The authenticated role tests use Supabase Auth, PostgreSQL, and Edge Functions. They are restricted to a local Supabase URL and refuse to seed a hosted project. Start the repository's local stack, reset it from the public migration and synthetic seed, then provide the local service credential through the ignored development environment.

```sh
npm run supabase:start
npm run supabase:reset
npm run test:e2e
npm run supabase:stop
```

The test seeder creates fictional accounts and removes them after each scenario. Keep the local stack disposable. Never point the suite at development, preview, or production services.

Playwright writes traces, videos, and screenshots under the ignored `test-results/` directory when a run fails.
