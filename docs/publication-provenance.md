# Publication provenance

The first public Exameny release candidate is prepared as a clean export from a
privately maintained application. Publication starts with a new Git history
instead of exposing the private repository's branches or commits.

That choice is deliberate. The private history included deployment identifiers,
obsolete credentials, internal documents, and educational material whose public
rights could not be established. Rewriting those commits would make the public
history difficult to audit and could preserve recoverable data by mistake.

The public export follows these rules:

- retain the full public application source needed for learner, teacher,
  academy, platform, and speaking workflows;
- replace educational prompts, fixtures, examples, and seed data with original
  clean-room material;
- reconstruct the database from versioned SQL and synthetic identities;
- replace private service defaults with local configuration and optional
  adapters;
- remove hosted project links, production records, private documents, logs,
  binaries, and provider credentials;
- preserve compatible third-party notices and record Exameny's own licenses;
- integrate the public AI boundary against the Responses API and publish both
  successful and failed evaluation evidence.

The maintainer keeps the source-to-export audit privately because it necessarily
names excluded private resources. After publication, contributors should treat
the public repository, its licenses, and its clean history as the authoritative
open-source edition. No private commit should be grafted onto it.

Future changes enter through public issues and pull requests, so maintenance
evidence can be inspected from the first release onward.
