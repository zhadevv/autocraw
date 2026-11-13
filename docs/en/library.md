# Library reference

```ts
import { Autocraw } from '@zhadev/autocraw';
```

The package is ESM and CommonJS, with TypeScript declarations. Types are exported from the package root.

## The Autocraw class

`new Autocraw(config?, registry?, hooks?)`

- `config`: partial [configuration](reference/config.md). Invalid values throw an `AutocrawError` with code `E_CONFIG`.
- `registry`: a custom `TemplateRegistry`. Defaults to the built-in registry.
- `hooks.urlGuard`: an async function called with every URL before it is fetched, including redirects and browser sub-requests. Throw to block. Used by the server to block private addresses.

`Autocraw` extends `EventEmitter`.

| Method | Returns |
| --- | --- |
| `scrape(url, options?)` | `Promise<ScrapeResult>` |
| `batchScrape(urls, { scrape?, concurrency? })` | `Promise<BatchItem[]>` |
| `map(url, options?)` | `Promise<MapResult>` |
| `crawl(url, options?)` | `Promise<CrawlResult>` |
| `discover(url, options?)` | `Promise<SiteReport>` |
| `inspect(url, compare?)` | `Promise<InspectResult>` |
| `media(url, followFrames?)` | `Promise<MediaReport>` |
| `extract(urls, options)` | `Promise<ExtractResult[]>` |
| `markdown(report, options?)` | `Promise<MarkdownResult>` |
| `registerTemplate(template)` | `this` |
| `close()` | `Promise<void>` |

URLs may omit the protocol; `https` is assumed.

### Events

| Event | Arguments | Emitted by |
| --- | --- | --- |
| `page` | `PageRecord` | `crawl` |
| `progress` | `string` step name | `discover` |
| `item` | `BatchItem`, index, total | `batchScrape` |

```ts
crawler.on('page', (page) => console.log(page.status, page.finalUrl));
await crawler.crawl('example.com', { maxPages: 20 });
```

## scrape

```ts
const result = await crawler.scrape('example.com', {
  formats: ['markdown', 'links', 'metadata', 'screenshot'],
  onlyMainContent: true,
  includeTags: ['article'],
  excludeTags: ['.ads'],
  waitFor: 1000,
  actions: [{ type: 'click', selector: 'button.load-more' }],
  fullPage: true,
});
```

`ScrapeOptions`:

| Field | Meaning |
| --- | --- |
| `formats` | Any of `markdown`, `html`, `text`, `links`, `images`, `metadata`, `screenshot`. Default `['markdown']` |
| `onlyMainContent` | Drop navigation, header, footer and sidebars. Default `true` |
| `includeTags`, `excludeTags` | CSS selectors to keep or remove |
| `mode` | `http`, `browser` or `auto` |
| `waitForSelector` | Selector to wait for in browser mode |
| `waitFor` | Milliseconds to wait after load, uses the browser |
| `actions` | Browser actions, see [scraping](guides/scraping.md) |
| `fullPage` | Full-page screenshot |

`ScrapeResult` has `url`, `finalUrl`, `status`, `via` (`http` or `browser`) and one field per requested format. `screenshot` is a base64 PNG.

## batchScrape

```ts
const items = await crawler.batchScrape(urls, { concurrency: 6, scrape: { formats: ['markdown'] } });
for (const item of items) console.log(item.ok ? item.data?.markdown?.length : item.error?.message);
```

Failures never reject the whole batch. Each item is `{ url, ok, data? , error? }`.

## map

```ts
const map = await crawler.map('example.com', { search: 'pricing', limit: 100, sitemap: 'include', includeSubdomains: false });
```

Returns `{ url, total, truncated, links: [{ url, title, source }], sitemaps, warnings }`. `source` is `sitemap` or `page`. robots.txt is honored when `respectRobots` is true.

## crawl

```ts
const result = await crawler.crawl('example.com', {
  maxPages: 50,
  maxDepth: 2,
  include: ['/blog/'],
  exclude: ['/tag/'],
  perPatternLimit: 5,
  computeSeo: false,
});
```

Returns `{ start, pages, skipped, errors, stats }`. With `computeSeo: false`, link and title extraction use the fast `rusteerio` HTML parser and fall back to jsdom if it is unavailable.

## discover

```ts
const report = await crawler.discover('your-site.example', { crawl: true, probes: true, crawlPages: 30, template: null });
```

Returns a `SiteReport`, see the [report schema](reference/report-schema.md). Throws `E_BLOCKED` when anti-bot protection blocks the home page and `E_ROBOTS` when robots.txt disallows the whole site.

## inspect and media

```ts
const info = await crawler.inspect('example.com', true);
console.log(info.techstack.renderStrategy, info.hydration?.trapped);

const media = await crawler.media('your-site.example/episode-1/', true);
```

## extract

```ts
const results = await crawler.extract('example.com/product', {
  ai: { provider: 'openai', apiKey: process.env.OPENAI_API_KEY! },
  schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, price: { type: ['number', 'null'] } } },
  prompt: 'Product name and price',
});
```

See [extraction](guides/extract.md).

## markdown

```ts
const result = await crawler.markdown(report, {
  mode: 'ai',
  template: 'site-structure',
  language: 'en',
  ai: { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
});
console.log(result.markdown, result.cached, result.inputTokens, result.outputTokens);
```

See [Markdown reports](guides/markdown-reports.md).

## Lower level exports

| Export | Use |
| --- | --- |
| `Session`, `HttpClient`, `BrowserSession` | Fetching primitives |
| `Crawler`, `discoverSite`, `inspectPage`, `scrapePage`, `batchScrape`, `mapSite`, `extractMany` | Functions behind the class methods |
| `detectTechStack`, `detectSSR`, `analyzeHydration`, `analyzeRawOnly` | Detection on HTML you already have |
| `detectMedia`, `decodeMirrorValue`, `unpackPacker` | Media detection helpers |
| `classifyUrl`, `groupUrls`, `patternKey` | URL classification |
| `RobotsPolicy`, `parseSitemap` | robots.txt and sitemap parsing |
| `htmlToMarkdown`, `extractSeo` | Extractors |
| `validateJsonSchema`, `parseJsonLoose` | Extraction helpers |
| `createApiServer`, `assertPublicUrl`, `createUrlGuard` | Server and SSRF protection |
| `TemplateRegistry`, `AnimeStreamTemplate`, `MadaraTemplate`, `GenericTemplate`, `BaseTemplate` | Templates |
| `exportReport`, `toJson` | Report output |
| `resolveConfig`, `defaultConfig` | Configuration |
| `solveCaptcha`, `detectCaptcha`, `detectCaptchaKind`, `listResolvers`, `registerResolver`, `getResolver` | Captcha solving (see below) |

## Captcha

`solveCaptcha(page, options)` works on a Playwright `Page`. It detects the captcha, solves it in the browser, and returns a result with `kind`, `solved`, `token`, `cookies`, `method`, `challenge` and `detail`. Pass `url` to let the solver open its own tab instead of touching your page. `timeoutMs`, `retries` and `signal` control the run, and `kind` forces a specific resolver.

```ts
import { detectCaptchaKind, solveCaptcha } from '@zhadev/autocraw';

const kind = await detectCaptchaKind(page);
if (kind) {
  const result = await solveCaptcha(page, { kind, timeoutMs: 30000 });
  console.log(result.solved, result.token);
}
```

Supported kinds are listed in [browser and anti-bot](guides/browser-and-anti-bot.md). Not everything is solvable; when a challenge needs something the solver does not have (for example an audio transcript for reCAPTCHA v2), `result.solved` is `false` and `result.challenge` names the reason.

## Errors

All errors thrown on purpose are `AutocrawError` with a `code` and `details`. Check with `isAutocrawError(error)`. See [errors](reference/errors.md).

```ts
import { isAutocrawError } from '@zhadev/autocraw';

try {
  await crawler.scrape('example.com');
} catch (error) {
  if (isAutocrawError(error) && error.code === 'E_BLOCKED') console.error('Blocked:', error.message);
  else throw error;
}
```
