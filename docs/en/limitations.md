# Limitations

Know these before you depend on autocraw.

## Not included

- No hosted service, dashboard or accounts. autocraw runs on your machine.
- No web search endpoint. `map --search` filters URLs of one site; it does not search the web.
- No asynchronous crawl jobs, queues, webhooks or persistence. The REST API is synchronous and capped for that reason.
- No change tracking or scheduled monitoring.
- Captcha solving is opt-in and only works inside the browser for the types listed in [browser and anti-bot](guides/browser-and-anti-bot.md). It does not cover every captcha, and it does not use paid solving services or external models.
- No PDF, Office or image OCR content extraction. Non-HTML responses are not converted to Markdown.
- Chromium family browsers only.

## Accuracy

- Technology detection is signature based. A site can hide or fake signatures. Confidence values are heuristic scores, not probabilities.
- Rendering strategy and hydration trap detection compare what was fetched with what was rendered. Sites that vary content by cookie, region or user agent can produce different results from run to run.
- Templates are tied to the markup of the versions they were checked against (AnimeStream 2.2.6, Madara 2.2.5.2). Customized themes and plugins can break selectors. The report says when it could not verify something.
- URL pattern grouping uses simple rules. Similar looking slugs can be grouped together and unusual ones apart.
- Markdown conversion favors readable main content and can drop or reorder unusual layouts. Use `--full` or `--include-tag` when it guesses wrong.
- AI output can be wrong or inconsistent. Prefer default mode when you need reproducible output, and verify AI documents against the JSON.

## Security

- The server blocks private addresses by resolving hostnames before connecting. DNS rebinding between the check and the connection is possible. Run the server where internal services are not reachable.
- Prompt injection from page content is mitigated by instructions, not eliminated.
- Browser stealth patches are best effort.

## Performance

- Each fetched page is parsed with jsdom for most operations, which is far heavier than a streaming parser. Crawls without SEO analysis and `map` use the faster `rusteerio` parser when available.
- The browser is started lazily and shared per instance; very large crawls should be split into several runs.

## Platform

- Node.js 22 or newer.
- The `rusteerio` parser ships native binaries. If one is not available for your platform, autocraw falls back to jsdom automatically.
