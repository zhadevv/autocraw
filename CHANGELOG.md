Changelog

0.0.1

First release.

Scraping and crawling
- scrape: Markdown, HTML, text, links, images, metadata and screenshots, with main-content detection and include/exclude selectors
- map: URL discovery from sitemaps and the start page, with relevance search
- crawl and batch scrape with robots.txt, per-host rate limits and per-pattern limits
- browser actions (wait, click, type, press, scroll, hover, select)
- HTTP client with retries, redirects, cookie jar and block detection
- Playwright fallback with stealth patches, network capture and custom browser path support
- fast link extraction with rusteerio, with a jsdom fallback

Site intelligence
- tech stack detection, SSR/RSC/CSR/SSG classification and hydration trap analysis
- Next.js (pages and RSC), Nuxt 2 and 3, Remix, SvelteKit, Astro and Qwik payload parsers
- URL taxonomy, verified pagination, live-verified search and filter extraction
- WordPress templates: AnimeStream (Themesia) and Madara (MangaBooth), custom templates via registry
- media inspection: hoster registry, base64 mirrors, packer unpacking, protection hints
- versioned JSON report (schemaVersion 1)

AI and reports
- Markdown reports in default (deterministic) and AI (OpenAI or Anthropic) modes, English and Indonesian
- token budgeting, response cache, retries and optional fallback
- structured extraction with JSON schema validation and a corrective retry

Interfaces
- CLI: zac (alias autocraw) with scrape, map, batch, crawl, discover, inspect, media, probe, extract, markdown, export, serve and doctor
- TypeScript library with events
- local REST API with bearer auth and private-address blocking
- documentation in English and Indonesian, llms.txt and llms-full.txt

Unreleased

- New command: selectors, finds CSS selectors for titles, listing cards, pagination, search, filters, players and download links on a page.
- New command: login, opens a visible browser for a human to pass a login or captcha, then saves cookies and user agent to a session file reusable via --session / sessionFile / AUTOCRAW_SESSION_FILE.
- Clearer error when a headed browser cannot open because there is no display (no X server), instead of a misleading "install chromium" message.
- Cloudflare Turnstile is now reported as its own block reason (cloudflare-turnstile) instead of a generic one.
- Hoster identification also falls back to a mirror option's visible label when its URL alone is ambiguous.
- Cookie jar now matches by domain suffix (so a cookie set on the apex domain is sent on subdomains), consistent with how browsers behave.

- New AI provider: ollama, for any locally running Ollama model, no API key needed.
- New commands: init (starter .env), install (browser or a Hugging Face model file), models list/pull/remove (manage local .gguf files; download only, autocraw does not run models itself).
