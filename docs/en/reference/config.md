# Configuration

## Sources and precedence

Highest first:

1. CLI flags
2. A JSON file: `--config <path>`, otherwise `autocraw.config.json` or `.autocrawrc.json` in the current directory
3. Environment variables: `AUTOCRAW_BROWSER_PATH`, `AUTOCRAW_PROXY`
4. Defaults

Unknown keys in a config file are rejected.

## Options

| Key | Default | Meaning |
| --- | --- | --- |
| `userAgent` | null | Fixed user agent. Null uses a recent desktop Chrome string |
| `rotateUserAgent` | false | Pick from built-in user agents per request |
| `timeoutMs` | 30000 | Request and navigation timeout, 1000 to 300000 |
| `retries` | 2 | Retries for transient failures, 0 to 10 |
| `retryBaseDelayMs` | 800 | Base for exponential backoff |
| `concurrency` | 3 | Parallel requests, 1 to 64 |
| `delayMs` | 500 | Minimum delay between requests to a host |
| `respectRobots` | true | Honor robots.txt and Crawl-delay |
| `maxPages` | 40 | Crawl page limit |
| `maxDepth` | 2 | Crawl depth limit |
| `maxBodyBytes` | 8388608 | Response size limit |
| `sameOrigin` | true | Stay on the start site while crawling |
| `include`, `exclude` | [] | Regular expression strings for crawled URLs |
| `mode` | `auto` | `http`, `browser` or `auto` |
| `proxy` | null | Proxy URL |
| `browserPath` | null | Chrome or Chromium executable |
| `sessionFile` | null | Saved login/captcha session from `zac login`, reused for cookies and user agent |
| `headers` | {} | Extra request headers |
| `headless` | true | Run the browser without a window |
| `stealth` | true | Browser stealth patches |
| `blockResources` | true | Block images, fonts and media in the browser |
| `waitUntil` | `domcontentloaded` | `load`, `domcontentloaded`, `networkidle` or `commit` |
| `scroll` | false | Auto-scroll in the browser |
| `useSitemap` | true | Read sitemaps during discovery |
| `locale` | `en-US` | Browser locale and Accept-Language |
| `verbose` | false | Debug logging to stderr |

Example `autocraw.config.json`:

```json
{
  "mode": "auto",
  "delayMs": 1000,
  "concurrency": 2,
  "headers": { "x-contact": "ops@example.com" },
  "exclude": ["/wp-json/", "\\?replytocom="]
}
```

## browserPath rules

`~` is expanded. Surrounding quotes are removed. If the path is a directory, autocraw looks inside it for `chrome`, `google-chrome-stable`, `google-chrome`, `chromium` or `chromium-browser`. If it does not point to a file, launching fails with an `E_BROWSER` error that says why.

## Environment variables

| Variable | Used for |
| --- | --- |
| `AUTOCRAW_BROWSER_PATH` | Browser executable |
| `AUTOCRAW_SESSION_FILE` | Session file from `zac login` |
| `AUTOCRAW_SERVER_KEY` | Bearer token for `zac serve` |
| `OPENAI_BASE_URL` | Override the OpenAI-compatible endpoint |
| `ANTHROPIC_BASE_URL` | Override the Anthropic-compatible endpoint |
| `OLLAMA_BASE_URL` | Ollama endpoint, default `http://localhost:11434` |
| `OLLAMA_MODEL` | Default model name for the `ollama` provider |
| `AUTOCRAW_PROXY` | Proxy URL |
| `AUTOCRAW_CACHE_DIR` | Cache folder, default `~/.cache/autocraw` |
| `AUTOCRAW_ENV_FILE` | Env file to load instead of `.env` (CLI) |
| `AUTOCRAW_SERVER_KEY` | Bearer token for `serve` |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `AUTOCRAW_API_KEY` | Key for either provider, provider inferred from the prefix |

The library never loads `.env` files on its own. The CLI does.
