# Security policy

## Supported versions

Before the first release, `main` is a release candidate without a compatibility
guarantee. After publication, the project will support the latest `0.x` release;
fixes may also land on `main`.

## Report a vulnerability

After publication, use [GitHub private vulnerability reporting](https://github.com/mtajada/exameny/security/advisories/new).
That route becomes available only after the repository enables private
vulnerability reporting. Until then, use the private contact method listed on
the maintainer's [`@mtajada`](https://github.com/mtajada) profile with the
subject `Exameny security report`. Do not include secrets in the first message.

Do not disclose a suspected vulnerability in a public issue, discussion, pull request, or chat. Include:

- the affected version or commit;
- the feature and account role involved;
- steps to reproduce with synthetic data;
- likely impact;
- a proposed fix, if you have one.

Remove tokens, cookies, personal data, and production records from screenshots and logs. Do not test against accounts or systems you do not own or have permission to assess.

## Relevant security boundaries

Reports may cover authentication, authorization, row-level security, academy isolation, privileged Edge Functions, prompt injection with security impact, exposed credentials, unsafe file handling, dependency flaws, and private-data leakage.

An inaccurate AI answer is usually a quality issue. Treat it as a security issue when it reveals private data, crosses tenant boundaries, changes authorization, or causes an unsafe privileged action.

## Maintainer response

Maintainers will confirm receipt through the private report, assess severity,
prepare a fix, and coordinate disclosure with the reporter. The project does
not promise a fixed response time. Release notes will credit reporters who want
public credit.

If a credential appears in a commit or log, assume exposure. Revoke or rotate it in the affected service, remove it from the public artifact, and document the incident without copying the value.
