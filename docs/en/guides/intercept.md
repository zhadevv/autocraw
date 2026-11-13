# Network intercept

`zac intercept` records the HTTP traffic a page produces while it loads, and groups it by domain and path kind. It is meant for figuring out which endpoints a site talks to: APIs, RSC payloads, Next.js data files, GraphQL, and so on.

## Why load the target from another page

If you open a site directly, you mostly see the document and static assets. The interesting payloads — Next.js `_next/data`, RSC streams, API calls that fill in content — are often only requested when the page is reached through a client-side transition. This is why `intercept` loads the target from another page of the same site before it starts recording: navigate to the source, open the network recording, then go to the target. The soft navigation in between is what triggers the payload requests.

Given two URLs, each one is used as the source for the other:

```sh
zac intercept example.com example.com/news
```

This records `example.com/news` while it is reached from `example.com`, and `example.com` while it is reached from `example.com/news`.

With a single URL, pass the source explicitly:

```sh
zac intercept example.com/news --from example.com
```

Without `--from` a single URL is loaded directly. You still get the full recording, just without the cross-page trigger.

## Interacting after load

After the target loads, the command clicks a couple of in-page controls (buttons, tabs, toggles), then scrolls to the bottom. The point is to trigger requests that happen on user interaction rather than on load.

- `--clicks <n>` changes how many controls are clicked (default 2, max 20).
- `--no-interact` skips both clicks and scrolling.
- `--no-scroll` keeps the clicks but skips scrolling.
- In-page links (`<a href="#...">`) are included; regular links are not, so the recording stays on the target page.

## Output

The default output is a table per target: request count, host summary (requests, bytes, errors, kinds), then one row per request with status, method, URL, content type, size and kind.

- `--json` prints the full data: every request with its method, URL, path, query parameters, POST body, request headers, response headers, status, content type, size and a 4 KB body snippet. Use `-o file.json` to save it.
- `--markdown` writes a report with the same data as tables. Use `-o file.md` to save it.

## What gets classified

Requests are tagged with a kind based on the path:

| Kind | Looks like |
| --- | --- |
| `next-data` | `/_next/data/<build>/<page>.json` |
| `rsc` | any URL with `?rsc=` |
| `data` | `/_data/...` and similar data paths |
| `api` | `/api/...` |
| `versioned-api` | `/v1/...`, `/v2/...` |
| `graphql` | `/graphql` |
| `trpc` | `/trpc/...` |
| `media` | images, video, audio, fonts |
| `static` | scripts and stylesheets |
| `document` | the pages themselves |
| `other` | everything else |

Hosts are marked as:

- `base` — the same host as the target URL.
- `subdomain` — a host that ends with the target's host (for example `api.example.com` under `example.com`).
- `external` — anything else.

The summary also notes when no API-like payloads were seen, or when all traffic stayed on the base host.

## Limits

- The recording sees HTTP requests only. WebSocket messages are not captured.
- The body snippet is capped at 4 KB and only saved for text-like responses.
- At most 300 requests per target are kept.
- Clicks are limited to safe in-page controls. Forms that navigate away are not submitted. A site that only exposes its endpoints after a deep interaction may still show nothing.
- The classification is pattern based. A site that uses unusual paths simply falls under `other`.
