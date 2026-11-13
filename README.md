<p align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="autocraw logo">
</p>

<h1 align="center">autocraw</h1>

<p align="center">
  <b>Scrape, map, crawl and understand any website.</b><br>
  LLM-ready Markdown, structured extraction, and a site intelligence engine that explains how a site is built.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@zhadev/autocraw"><img src="https://img.shields.io/npm/v/@zhadev/autocraw?color=cb3837" alt="npm version"></a>
  <a href="https://github.com/zhadevv/autocraw/actions/workflows/ci.yml"><img src="https://github.com/zhadevv/autocraw/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-3c873a" alt="Node 22+">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="GPL-3.0">
</p>

<p align="center">
  <a href="docs/en/index.md">Docs</a> ·
  <a href="docs/en/getting-started.md">Getting started</a> ·
  <a href="docs/en/cli.md">CLI</a> ·
  <a href="docs/en/library.md">Library</a> ·
  <a href="docs/en/server-api.md">REST API</a> ·
  <a href="README.id.md">Bahasa Indonesia</a>
</p>

---

autocraw is a Node.js 22+ toolkit with three faces: a CLI called **`zac`**, a TypeScript library, and a local REST API. It covers the everyday scraping jobs and adds something most scrapers do not: it tells you **how the site works** before you write a single selector.

## Features

| | |
| --- | --- |
| **Scrape** | One page to Markdown, HTML, text, links, images, metadata or a screenshot. Main-content detection, include and exclude selectors |
| **Map** | Fast URL discovery from sitemaps and the start page, with relevance search |
| **Crawl** | Breadth-first crawl with robots.txt, per-host rate limits, include and exclude patterns and per-pattern limits |
| **Batch** | Many URLs in parallel, NDJSON output, failures isolated per URL |
| **Browser actions** | Wait, click, type, press, scroll, hover and select, then scrape or screenshot |
| **Extract** | AI structured extraction (OpenAI or Anthropic) with JSON schema validation and a corrective retry |
| **Site intelligence** | Tech stack, SSR vs CSR vs RSC vs SSG, hydration traps, Next.js and Nuxt payloads, URL patterns, verified pagination, search and filters |
| **Templates** | WordPress anime and manga themes: AnimeStream (Themesia) and Madara (MangaBooth), plus your own |
| **Media inspection** | Players, base64 mirrors, HLS and MP4 sources, hoster identification, packer unpacking, protection hints |
| **Reports** | Markdown reports in two modes: deterministic code, or AI written with token budgeting, caching and fallback |
| **Anti-bot aware** | Block detection, automatic browser escalation, stealth patches, retries with backoff |
| **Captcha** | `--solve-captcha` solves Cloudflare, reCAPTCHA, GeeTest, AWS WAF, Wobble and POWBlock in the browser |
| **Network intercept** | `zac intercept` records a page's HTTP traffic and groups it by domain and path kind (API, RSC, Next data, GraphQL) |
| **REST API** | `zac serve` with bearer auth and private-address (SSRF) blocking |

## Install

```sh
npm install -g @zhadev/autocraw
zac doctor
```

Browser features need Chrome or Chromium. Either run `npx playwright install chromium`, or point `AUTOCRAW_BROWSER_PATH` at a browser you already have. From a source checkout: `npm install && npm run build && node dist/cli.js doctor`.

## Quick start

```sh
zac scrape example.com
zac map example.com --search pricing
zac batch --file urls.txt -o results.ndjson
zac scrape example.com --wait-ms 1500 --screenshot shot.png --full-page
zac scrape example.com --solve-captcha
zac intercept example.com example.com/news --json -o traffic.json
zac extract example.com/product --schema product.schema.json --api-key YOUR_KEY
zac discover your-site.example -o site.md --json-out report.json
zac markdown report.json --markdown ai --api-key YOUR_KEY --lang id
zac serve --port 3002 --key my-secret
```

## Library

```ts
import { Autocraw } from '@zhadev/autocraw';

const crawler = new Autocraw({ mode: 'auto' });

try {
  const page = await crawler.scrape('example.com', { formats: ['markdown', 'metadata'] });
  console.log(page.markdown);

  const map = await crawler.map('example.com', { search: 'docs', limit: 50 });
  console.log(map.links.map((link) => link.url));

  const report = await crawler.discover('your-site.example');
  const doc = await crawler.markdown(report, { mode: 'default', language: 'en' });
  console.log(doc.markdown);
} finally {
  await crawler.close();
}
```

## What `discover` tells you

Point it at a site and get a report with, among other things:

- the CMS, frameworks, CDN, server and analytics in use
- whether content arrives as server-rendered HTML, a hydration payload, RSC flight data or only after JavaScript runs, with the reasons
- how URLs are shaped, how pagination works (and whether page 2 really returns different items), how search works (verified with a live query) and which filters exist
- sample detail and episode pages, their mirrors and downloads, hosters, and signs of encryption or DRM
- caveats listing everything it could not verify

The report is available as JSON (`schemaVersion: 1`) and as Markdown, in English or Indonesian.

## Markdown modes

| Mode | Needs | Output |
| --- | --- | --- |
| `default` | nothing | Deterministic, reproducible, offline |
| `ai` | OpenAI or Anthropic API key | Narrative document written by the model from a token-budgeted copy of the report. Cached by content hash, retries transient errors, optional fallback to `default` |

## How it compares to Firecrawl

autocraw is not a clone of a hosted service. It is a local tool with overlapping features and a different focus.

| | autocraw | Firecrawl (hosted API) |
| --- | --- | --- |
| Runs on | your machine or server | vendor cloud, or self-hosted |
| Scrape, map, crawl, batch, actions, screenshots, extract | yes | yes |
| Site structure intelligence (stack, SSR/RSC, hydration, URL patterns, pagination and search probes) | yes | no |
| Theme templates for anime and manga WordPress sites | yes | no |
| Media source and protection analysis | yes | no |
| Web search endpoint | no | yes |
| Async jobs, webhooks, managed proxies, scaling | no | yes |

See [limitations](docs/en/limitations.md) for the full list of what autocraw does not do.

## Documentation

- [Getting started](docs/en/getting-started.md)
- [CLI reference](docs/en/cli.md)
- [Library reference](docs/en/library.md)
- [Server API](docs/en/server-api.md)
- Guides: [scraping](docs/en/guides/scraping.md), [discovery](docs/en/guides/discovery.md), [extraction](docs/en/guides/extract.md), [Markdown reports](docs/en/guides/markdown-reports.md), [templates](docs/en/guides/templates.md), [browser and anti-bot](docs/en/guides/browser-and-anti-bot.md), [network intercept](docs/en/guides/intercept.md), [responsible use](docs/en/guides/responsible-use.md)
- Reference: [configuration](docs/en/reference/config.md), [report schema](docs/en/reference/report-schema.md), [errors](docs/en/reference/errors.md)
- [Troubleshooting](docs/en/troubleshooting.md) · [Development](docs/en/development.md)
- For LLMs: [llms.txt](docs/llms.txt), [llms-full.txt](docs/llms-full.txt)

## Responsible use

autocraw honors robots.txt and crawl delays by default and rate limits requests per host. Use it only on sites you are allowed to access, follow their terms and applicable law, and respect the copyright of the content you retrieve. It reports signs of encryption and DRM; it does not bypass them. Details in [responsible use](docs/en/guides/responsible-use.md).

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [development guide](docs/en/development.md). Security issues: [SECURITY.md](SECURITY.md).

## License

GPL-3.0-only. See [LICENSE](LICENSE).

Made by [zhadev](https://github.com/zhadevv).
