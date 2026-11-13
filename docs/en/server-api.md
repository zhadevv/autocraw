# Server API

`zac serve` runs a small REST API that wraps the library. It is meant for local tools, internal services and agents.

```sh
zac serve --port 3002 --key my-secret
```

| Option | Meaning |
| --- | --- |
| `--host` | Interface to bind. Default `127.0.0.1` |
| `--port` | Port. Default `3002` |
| `--key` | Bearer token. Can also be set with `AUTOCRAW_SERVER_KEY` |
| `--max-concurrent` | Simultaneous jobs. Default 4. Extra requests get HTTP 429 |
| `--allow-private` | Allow localhost and private network targets |

Binding to anything other than a loopback address without a key is refused.

## Security model

- Requests must send `Authorization: Bearer <key>` when a key is set. Comparison is constant time.
- By default every URL is checked before fetching, including redirects and browser sub-requests. Loopback, private, link-local, carrier-grade NAT and metadata addresses, plus `localhost`, `.local` and `.internal` names, are blocked. Hostnames are resolved and every address is checked.
- The check happens at request time. A hostile DNS server could still change its answer between the check and the connection, so do not treat this as a complete defense on an untrusted network. Run the server in a network segment with no access to internal services.
- Request bodies are limited to 1 MiB.
- The server does not provide HTTPS or rate limiting per client. Put it behind a reverse proxy if you expose it.

## Response format

Success:

```json
{ "success": true, "data": { } }
```

Failure:

```json
{ "success": false, "error": { "code": "E_INPUT", "message": "Invalid request: url: Invalid input" } }
```

HTTP status codes: 400 invalid input or configuration, 401 bad token, 403 robots.txt, 404 unknown route, 405 wrong method, 413 body too large, 422 unparseable content, 429 busy or provider rate limit, 502 upstream or blocked, 504 timeout.

## Endpoints

All endpoints except `GET /health` are `POST` with a JSON body.

### GET /health

Returns `{ "status": "ok", "version": "..." }`. No authentication.

### POST /v1/scrape

```json
{
  "url": "https://example.com",
  "formats": ["markdown", "links"],
  "onlyMainContent": true,
  "includeTags": ["article"],
  "excludeTags": [".ads"],
  "mode": "auto",
  "waitFor": 1000,
  "waitForSelector": "main",
  "actions": [{ "type": "click", "selector": "button.more" }],
  "fullPage": false
}
```

Only `url` is required. Returns a `ScrapeResult`. A `screenshot` format returns a base64 PNG.

### POST /v1/map

```json
{ "url": "https://example.com", "search": "pricing", "limit": 100, "sitemap": "include", "includeSubdomains": false }
```

### POST /v1/crawl

```json
{ "url": "https://example.com", "maxPages": 25, "maxDepth": 2, "include": ["/blog/"], "exclude": [], "perPatternLimit": 5 }
```

Synchronous. `maxPages` is capped at 100 and `maxDepth` at 5.

### POST /v1/discover

```json
{ "url": "https://example.com", "crawl": true, "probes": true, "crawlPages": 30, "markdown": { "template": "site-structure", "language": "en" } }
```

Returns `{ report, markdown }`. `markdown` is null when not requested. The server generates the deterministic Markdown only; for AI Markdown call the library or CLI.

### POST /v1/extract

```json
{
  "urls": ["https://example.com/product"],
  "schema": { "type": "object", "properties": { "name": { "type": "string" } } },
  "prompt": "Product name",
  "ai": { "provider": "openai", "apiKey": "sk-...", "model": "gpt-4.1" }
}
```

Up to 10 URLs. Without `ai`, the server uses `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` from its environment.

### POST /v1/batch/scrape

```json
{ "urls": ["https://a.example", "https://b.example"], "formats": ["markdown"], "concurrency": 4 }
```

Up to 50 URLs. Returns one item per URL with `ok`, `data` or `error`.

## Example

```sh
curl -s http://127.0.0.1:3002/v1/scrape \
  -H "authorization: Bearer my-secret" \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com","formats":["markdown"]}'
```

## Embedding

```ts
import { Autocraw, createApiServer, createUrlGuard } from '@zhadev/autocraw';

const guard = createUrlGuard();
const engine = new Autocraw({}, undefined, { urlGuard: guard });
const server = createApiServer({ engine, apiKey: process.env.KEY, guard, maxConcurrent: 4 });
server.listen(3002, '127.0.0.1');
```
