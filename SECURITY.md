# Security policy

## Supported versions

Only the latest published version receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting on the repository (Security tab, "Report a vulnerability"). Include the version, a description, steps to reproduce and the impact.

You can expect an acknowledgement within a few days. Fixes are released as soon as practical, and reporters are credited unless they ask not to be.

## Scope notes

- The REST server (`zac serve`) is intended for localhost or trusted networks. See `docs/en/server-api.md` for its security model, including the limits of the private address check.
- autocraw sends page content to OpenAI or Anthropic only when you use AI mode or `extract`.
- Reports about sites crawled with autocraw belong to the operators of those sites, not to this project.
