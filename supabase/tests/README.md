# Database tests

`npm run db:check` validates the public migration and synthetic seed with an embedded PostgreSQL runtime. It executes both artifacts twice, verifies row-level security and grants, and exercises representative writing, language-use, and speaking operations.

The embedded check is fast and deterministic, but it does not replace the full Supabase container gate. Before a release, also run:

```sh
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:stop
```
