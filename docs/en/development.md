# Development

## Setup

```sh
git clone https://github.com/zhadevv/autocraw.git
cd autocraw
npm install
npm run typecheck
npm test
npm run build
node dist/cli.js doctor
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Bundle with tsup: ESM and CJS library, ESM CLI with a shebang, declarations |
| `npm run dev` | Rebuild on change |
| `npm run typecheck` | `tsc --noEmit` over `src` and `tests` |
| `npm test` | Vitest, unit tests |
| `npm run docs:llms` | Rebuild `docs/llms-full.txt` from the English docs |

## Layout

```
src/
  cli/          commander commands, option parsing, spinner and tables
  core/         session, crawler, discovery, scrape, map, batch, extract, inspect
  browser/      Playwright session, actions, anti-block, hydration analysis
  http/         undici client, RSC fetcher, request replay
  compliance/   robots.txt, sitemaps, rate limiter
  techstack/    signatures, detector, render strategy and data format
  ssr/          Next.js, Nuxt, Remix, SvelteKit, Astro, Qwik payload parsers
  templates/    base, generic, registry, wordpress/animestream, wordpress/madara
  extractors/   links, images, SEO, text and Markdown, fast parser
  probes/       pagination, search, filter, detail, watch
  media/        detector, hoster registry, encryption and packer helpers
  classify/     URL taxonomy
  markdown/     default generator and AI generator, providers, cache
  report/       JSON, CSV, export
  server/       REST API and SSRF guard
  config/       defaults and schema
  utils/        errors, URLs, DOM helpers, files, logging
tests/unit/     fixtures are inline HTML strings
```

## Conventions

- TypeScript strict mode, ESM, no default exports for modules with several exports.
- Source files contain no comments by project convention. Put explanations in names, small functions, tests and these docs.
- Validate at the edges with zod or explicit checks and throw `AutocrawError` with a specific code.
- Never swallow errors silently unless the failure is genuinely optional, and then record it as a caveat or debug log.
- Keep detectors conservative. Prefer reporting "not detected" to guessing.
- New dependencies need a reason; this is a published CLI.

## Tests

Tests live in `tests/unit` and use small inline HTML fixtures modeled on real markup. When you add or fix a template selector, add a fixture that fails without the change. Tests must not hit the network. The AI provider tests point at an unreachable address to test fallback behavior.

## Adding a template

See [templates](guides/templates.md). Register it in `src/templates/registry.ts` if it should be built in, with detection tests and selector notes in the template guide.

## Releasing

1. Update `CHANGELOG.md` and the version in `package.json` and `src/version.ts`.
2. `npm run typecheck && npm test && npm run build`.
3. Check the package contents with `npm pack --dry-run`.
4. Commit, then tag `vX.Y.Z` and push the tag.

The `release` workflow runs the checks and publishes with provenance. It needs an `NPM_TOKEN` repository secret with publish rights for the `@zhadev` scope. The package is published publicly (`publishConfig.access`).

Commit `package-lock.json`; CI uses `npm ci`.

## License

GPL-3.0-only. By contributing you agree your contribution is licensed under the same terms.
