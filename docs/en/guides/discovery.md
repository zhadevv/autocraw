# Site discovery and reports

`discover` answers the question "how is this site built and how do I crawl it?"

```sh
zac discover your-site.example -o site.md --json-out report.json
```

## What it does

1. Reads robots.txt. Refuses a site that disallows everything unless `--ignore-robots` is set.
2. Fetches the home page with HTTP, and with a browser too when HTTP is blocked or the HTML looks like an empty shell.
3. Detects the tech stack: frameworks, CMS, CDN, server, analytics, libraries.
4. Detects server payloads: Next.js `__NEXT_DATA__` and RSC flight chunks, Nuxt 2 and 3, Remix, SvelteKit, Astro islands, Qwik.
5. Compares raw and rendered HTML to find hydration traps.
6. Picks a site template (AnimeStream, Madara or generic). See [templates](templates.md).
7. Reads sitemaps and groups URLs into patterns.
8. Probes the site: pagination (verifies page 2 returns different items), search (runs a real query), filters, a detail page, an episode or chapter page and its media sources.
9. Optionally runs a shallow crawl.
10. Writes the report as JSON and Markdown.

## Rendering strategy and data format

These are separate questions.

Rendering strategy: `ssr`, `ssg`, `csr`, `rsc` or `hybrid`, with reasons. For example a WordPress theme with plenty of visible text and no hydration payload is reported as `ssr`; an empty `#root` is `csr`; flight chunks are `rsc`.

Data format: `html-only`, `json-hydration`, `rsc-flight`, `graphql`, `rest-json` or `mixed`. XHR/fetch calls are only captured when a browser render happened; run with `--mode browser` to capture API endpoints.

## Hydration traps

A hydration trap is a page whose raw HTML is a shell and whose content appears only after JavaScript runs. autocraw reports the text and link counts for raw and rendered HTML and the ratio. When a trap is found, plain HTTP crawling will miss content and the report says so.

## Speeding up or narrowing down

```sh
zac discover your-site.example --no-crawl --no-probes
zac discover your-site.example --template wordpress-madara
zac probe search your-site.example
```

## Using the report

The JSON report is stable and versioned (`schemaVersion`). See the [schema](../reference/report-schema.md). Common follow-ups:

```sh
zac export report.json -f csv-urls -o url-patterns.csv
zac markdown report.json --markdown ai --lang id -o report.id.md
```

## Caveats section

Anything autocraw could not verify is listed under caveats: unreadable sitemap files, a listing page that returned an error, search that returned no recognizable cards, pagination that could not be verified, and similar. Read it before trusting the rest.
