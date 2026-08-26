# Public migration baseline

`20260826153916_initial_public_schema.sql` is the clean-room baseline for the public edition of Exameny. It is intentionally independent from every hosted Supabase project and from the private repository's migration history.

The baseline contains the application schema, functions, triggers, explicit grants, and row-level security policies needed by the learner, teacher, academy, writing, language-use, and speaking flows. `../seed.sql` adds deterministic synthetic records only.

Run it locally with:

```sh
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
```

Do not point these commands at a hosted project. New schema changes belong in new timestamped migration files; do not edit a migration that has appeared in a release.
