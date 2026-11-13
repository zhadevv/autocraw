# Scraping pages, batches, actions and screenshots

## Single page

```sh
zac scrape example.com
```

By default autocraw fetches with plain HTTP, converts the main content to Markdown and drops navigation, header, footer and sidebars. If the page is blocked by a challenge or is an empty client-side shell, it retries with a browser automatically (`--mode auto`).

Force a mode with `--mode http` or `--mode browser`.

## Choosing content

- `--full` keeps everything, including navigation and footers.
- `--include-tag article` keeps only elements matching the selector.
- `--exclude-tag ".cookie-banner"` removes elements matching the selector. Both flags are repeatable.

Include and exclude run before main-content detection. An invalid CSS selector fails with `E_INPUT`.

## Output formats

| Format | Content |
| --- | --- |
| `markdown` | LLM-ready Markdown with absolute links |
| `html` | The fetched HTML |
| `text` | Visible text |
| `links` | Unique links with text, rel and an internal flag |
| `images` | Images with alt text, size and lazy-loading flag |
| `metadata` | Title, description, canonical, headings, Open Graph, JSON-LD types and SEO issues |
| `screenshot` | PNG, base64 in JSON or a file with `--screenshot` |

## Batches

```sh
zac batch --file urls.txt -f markdown --batch-concurrency 6 -o results.ndjson
```

Output is NDJSON with one object per URL. Duplicates are removed. A failure is reported in that URL's `error` field and does not stop the others. Politeness settings still apply per host (`--delay`).

## Browser actions

Actions run after the page loads, in order, in a real browser. Put them in a JSON file:

```json
[
  { "type": "wait", "selector": "main" },
  { "type": "click", "selector": "button.load-more" },
  { "type": "wait", "ms": 1000 },
  { "type": "scroll", "direction": "down", "amount": 1600 }
]
```

```sh
zac scrape example.com --actions actions.json
```

| Action | Fields |
| --- | --- |
| `wait` | `ms` (up to 30000) or `selector` |
| `click` | `selector` |
| `type` | `selector`, `text` |
| `press` | `key`, for example `Enter` |
| `scroll` | `direction` (`down` or `up`), `amount` in pixels |
| `hover` | `selector` |
| `select` | `selector`, `value` |

At most 50 actions. If an action fails, the error names the action number and type. Actions and screenshots are not available in `--mode http`.

## Screenshots

```sh
zac scrape example.com --screenshot page.png --full-page
```

Images and fonts are normally blocked in browser mode for speed. Screenshots allow them automatically.

## Dynamic pages

For client-rendered pages use `--mode browser`, `--wait <selector>` to wait for a specific element, or `--scroll` for lazy-loaded lists. `zac inspect <url> --compare` tells you whether a page actually needs a browser.
