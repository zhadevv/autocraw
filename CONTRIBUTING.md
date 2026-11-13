# Contributing

Thanks for helping improve autocraw.

## Quick start

```sh
npm install
npm run typecheck
npm test
npm run build
```

Read `docs/en/development.md` for the layout, conventions and release process.

## Guidelines

- Open an issue first for large changes or new features.
- Keep pull requests focused. Add or update tests; tests must not use the network.
- Follow the project conventions: strict TypeScript, no comments in source files, errors thrown as `AutocrawError` with a specific code, conservative detection.
- Template changes need an inline HTML fixture based on real markup and a note of the theme version.
- Update `CHANGELOG.md` and the docs when behavior changes.
- By contributing you agree that your work is licensed under GPL-3.0-only.

## Reporting bugs

Include your Node.js version, the exact command, the output with `-v`, and whether the problem happens with `--mode http`, `--mode browser` or both. Remove API keys and private URLs.
