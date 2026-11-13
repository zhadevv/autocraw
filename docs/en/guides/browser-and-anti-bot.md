# Browser mode and anti-bot behavior

## When the browser is used

| Situation | Mode |
| --- | --- |
| `--mode http` | Never |
| `--mode browser` | Always |
| `--mode auto` | When HTTP is blocked (Cloudflare, DDoS-Guard, captcha pages, 403/429 with a challenge) or the HTML is an empty client-side shell |
| Actions, screenshots, `--wait-ms` | Always, and they fail in `--mode http` |

## Choosing a browser

Use Playwright's Chromium (`npx playwright install chromium`) or your own Chrome or Chromium with `AUTOCRAW_BROWSER_PATH`, `--browser-path` or `browserPath`. Run `zac doctor` to verify.

## Stealth

Browser mode applies small patches by default: it hides `navigator.webdriver`, sets languages, plugins and a Chrome runtime object, and adjusts WebGL vendor strings. Disable with `--no-stealth`. These patches help with simple automation checks. They are not a guarantee against modern bot protection.

## Challenges

When a page title looks like a challenge ("Just a moment", "Attention required"), autocraw waits up to 15 seconds for it to resolve. If the page is still blocked, the command fails with `E_BLOCKED` and exit code 3.

## Captcha

autocraw can solve some captchas itself, right in the browser. Add `--solve-captcha` to any command that opens a browser (`scrape`, `discover`, `crawl`, `inspect`, `media`, …). After the page loads, autocraw detects a captcha, solves it, then reloads the page to pick up the real content.

Supported types:

| Type | How it is solved |
| --- | --- |
| Cloudflare Turnstile | Click through, or inject the widget and collect the token |
| Cloudflare interstitial | Wait for `cf_clearance` |
| reCAPTCHA v2 / v3 / Enterprise | Auto-click, or collect a token from the page |
| GeeTest v3 / v4 | Slide puzzle: find the gap in the background image, then drag |
| AWS WAF | Wait for the `aws-waf-token` cookie; click or drag if a puzzle appears |
| Wobble | Slide puzzle with two gaps: pick the matching gap, then drag |
| POWBlock | Mine a SHA-256/512 proof of work in Node, then submit it |

Limits:

- Only types in the table are detected. An unknown captcha just leaves the page blocked.
- GeeTest is solved as a slide puzzle. Icon, click, nine-grid and word challenges are reported as unsupported.
- reCAPTCHA v2 audio is not transcribed automatically. From the library you can pass a `transcribe` callback that receives the audio URL and returns the answer.
- Solving uses a real browser and real mouse movement. That is not a guarantee against bot protection that changes, and it is not a bypass of access rules: use it only on sites you are allowed to interact with.
- When `--solve-captcha` is set and the solve fails, the fetch continues with whatever it got and the page is reported blocked as usual.

`--captcha-kind <kind>` forces a specific resolver instead of detecting. Run `zac scrape --help` to see the available kinds.

If you hit blocks:

- Try `--mode browser`, or `--headed` to watch what happens.
- Slow down: `--delay 1500 --concurrency 1`.
- Use a proxy you are allowed to use: `--proxy`.
- Set a realistic `--user-agent`, or `--rotate-ua`.
- Decide whether crawling the site is appropriate at all. See [responsible use](responsible-use.md).

## HTTP client behavior

- Retries transient failures (408, 425, 429, 500, 502, 503, 504 and network errors) with exponential backoff and jitter, honoring `Retry-After`.
- Follows up to 10 redirects, keeps a per-host cookie jar, decodes the response charset and limits bodies to 8 MiB by default.
- Detects blocked responses from headers and body markers and marks the result as blocked.

## Rate limiting

Requests to one host are spaced by `--delay` (default 500 ms), raised automatically to a robots.txt `Crawl-delay`, and pushed back after HTTP 429.

## Speed and resources

Browser mode blocks images, fonts and media unless you pass `--load-images` or request a screenshot. Pages are captured with their XHR and fetch calls (up to 300 entries, with 4 KB body snippets) so discovery can report API endpoints.
