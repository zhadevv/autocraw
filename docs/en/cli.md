# CLI reference

```
zac <command> [options]
```

The command is `zac` (short for zhadev auto craw). `autocraw` works as an alias. From a source checkout, run `node dist/cli.js <command>` after `npm run build`.

Progress and warnings go to stderr. Results go to stdout, or to a file with `-o, --output`, so output can be piped.

## Commands

| Command | Purpose |
| --- | --- |
| `scrape <url>` | One page to Markdown, HTML, text, links, images, metadata or a screenshot |
| `map <url>` | List the URLs of a site from sitemaps and the start page |
| `batch [urls...]` | Scrape many URLs in parallel, one JSON object per line |
| `crawl <url>` | Breadth-first crawl listing each page with its kind |
| `discover <url>` | Full site analysis and Markdown report |
| `inspect <url>` | Tech stack, SSR/RSC payloads and hydration trap for one URL |
| `media <url>` | Players, mirrors, HLS/MP4 sources, hosters and protection hints |
| `probe <what> <url>` | Run one probe: pagination, search, filter, detail, watch, read |
| `intercept [urls...]` | Record HTTP traffic while pages load, grouped by domain and path kind |
| `captcha [url]` | List supported captchas, or test a page for them |
| `extract <urls...>` | Structured JSON extraction with an AI model |
| `markdown <report>` | Saved JSON report to Markdown, default or AI |
| `export <report>` | Saved JSON report to JSON, Markdown or CSV |
| `serve` | Local REST API |
| `doctor` | Check the environment |

## Options shared by most commands

| Option | Meaning |
| --- | --- |
| `-m, --mode <http\|browser\|auto>` | Fetch mode. `auto` uses HTTP and escalates to the browser when needed. Default `auto` |
| `--config <path>` | JSON config file. `autocraw.config.json` in the current directory is picked up automatically |
| `-A, --user-agent <ua>` | Custom user agent |
| `--rotate-ua` | Rotate between built-in browser user agents |
| `--proxy <url>` | HTTP(S) proxy |
| `--browser-path <path>` | Chrome or Chromium executable |
| `--timeout <ms>` | Request timeout, 1000 to 300000 |
| `--retries <n>` | Retries for transient failures, 0 to 10 |
| `--concurrency <n>` | Parallel requests, default 3 |
| `--delay <ms>` | Minimum delay between requests to a host, default 500 |
| `--ignore-robots` | Do not honor robots.txt |
| `-H, --header "Name: value"` | Extra request header, repeatable |
| `--headed` | Show the browser window |
| `--no-stealth` | Disable browser stealth patches |
| `--load-images` | Allow images, fonts and media in the browser |
| `--scroll` | Auto-scroll pages in the browser |
| `--solve-captcha` | Solve a supported captcha in the browser before reading the page. See [browser and anti-bot](guides/browser-and-anti-bot.md) |
| `--captcha-kind <kind>` | Force a captcha resolver instead of detecting. Only meaningful with `--solve-captcha` |
| `--locale <locale>` | Browser and Accept-Language locale |
| `-v, --verbose` | Debug logging |

Crawl limits, available on `discover` and `crawl`: `--max-pages`, `--max-depth`, `--include <regex>`, `--exclude <regex>` (both repeatable) and `--no-sitemap`.

AI options, available on `extract` and the markdown commands: `--ai-provider <openai|anthropic>`, `--api-key`, `--ai-model`, `--ai-base-url`, `--ai-max-input`, `--ai-max-output`, `--ai-temperature`, `--ai-timeout`, `--no-cache`.

## scrape

```sh
zac scrape example.com
zac scrape example.com -f markdown,links,metadata -o page.json
zac scrape example.com --include-tag article --exclude-tag ".ads"
zac scrape example.com --wait-ms 1500 --screenshot shot.png --full-page
zac scrape example.com --actions actions.json
```

`-f, --format` takes a comma separated list or repeated flags: `markdown`, `html`, `text`, `links`, `images`, `metadata`, `screenshot`. With only `markdown`, the Markdown is printed directly; otherwise JSON is printed.

`--full` keeps navigation, header, footer and sidebars. `--include-tag` keeps only matching elements; `--exclude-tag` drops matching elements. Both take CSS selectors.

`--wait-ms`, `--actions` and `--screenshot` need a browser and fail in `--mode http`. See [scraping](guides/scraping.md) for the action format.

## map

```sh
zac map example.com
zac map example.com --search "pricing docs" --limit 50 --json
zac map example.com --sitemap-mode only
```

`--sitemap-mode` is `include` (default), `only` or `skip`. `--subdomains` includes subdomains. With `--search`, only matching URLs are returned, best matches first.

## batch

```sh
zac batch https://a.example https://b.example -f markdown
zac batch --file urls.txt --batch-concurrency 6 -o results.ndjson
```

`urls.txt` has one URL per line. Blank lines and lines starting with a hash sign are ignored. Failures do not stop the batch; each failed line has an `error` field.

## crawl

```sh
zac crawl your-site.example --max-pages 50 --format ndjson
zac crawl your-site.example --per-pattern 5 --no-seo
```

`--format` is `table` (default), `json` or `ndjson`. `--per-pattern` limits pages per URL pattern, which gives a broader sample of a large site.

## discover

```sh
zac discover your-site.example -o site.md --json-out report.json
zac discover your-site.example --markdown ai --api-key YOUR_KEY --lang id
zac discover your-site.example --template wordpress-animestream --no-crawl
```

Options: `-o, --output`, `--json-out <file>`, `--json` (print the raw report), `--no-crawl`, `--no-probes`, `--crawl-pages <n>`, `--template <id>`, `-q, --quiet`. Markdown options: `--markdown <default|ai>`, `--md-template <site-structure|seo-audit|techstack>`, `--lang <en|id>`, `--ai-fallback`, `--no-toc`, `--no-frontmatter`.

## inspect

```sh
zac inspect example.com --compare
```

`--compare` always renders with a browser and compares raw and rendered HTML to detect hydration traps.

## media

```sh
zac media your-site.example/episode-1/ --follow-frames
```

`--follow-frames` also fetches embedded player iframes and HLS manifests.

## probe

```sh
zac probe pagination your-site.example
```

`<what>` is `pagination`, `search`, `filter`, `detail`, `watch` or `read`. The command runs discovery without the crawl and prints that section.

## intercept

```sh
zac intercept example.com example.com/news
zac intercept example.com/news --from example.com
zac intercept example.com --json -o traffic.json
zac intercept example.com --markdown -o traffic.md --no-interact
```

Each URL is loaded from the previous one in the list (or from `--from`), so client-side payloads that only appear on soft navigation are captured. `--clicks <n>` sets how many in-page controls are clicked, `--no-interact` skips clicks and scrolling, `--no-scroll` skips scrolling only. See [network intercept](guides/intercept.md).

## captcha

```sh
zac captcha            # list supported kinds
zac captcha example.com
zac captcha example.com --solve
```

With no URL, the command lists the captcha kinds autocraw can solve. With a URL, it opens the page in a browser and reports which kinds are present. `--solve` also attempts to solve the first detected captcha and prints the outcome; if it fails, the exit code is 5.

## extract

```sh
zac extract example.com/product --schema product.schema.json
zac extract example.com/a example.com/b --prompt "company name and pricing" --api-key YOUR_KEY
```

See [extraction](guides/extract.md).

## markdown and export

```sh
zac markdown report.json --markdown ai --lang id -o report.md
zac export report.json -f csv-urls -o urls.csv
```

`export -f` is `json`, `markdown`, `csv-urls` or `csv-pages`.

## serve

```sh
zac serve --port 3002 --key my-secret
```

See [server API](server-api.md).

## doctor

```sh
zac doctor
zac doctor --skip-network
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unexpected error, or `extract` where some pages failed validation |
| 2 | Invalid configuration or input |
| 3 | Blocked by anti-bot protection or robots.txt |
| 4 | HTTP, network or timeout error |
| 5 | Browser could not start or navigate, or a captcha could not be solved |
| 6 | AI provider error |
| 7 | File read, write or parse error |
