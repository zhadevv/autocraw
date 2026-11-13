# Responsible use

autocraw can fetch many pages quickly. You are responsible for how you use it.

## Defaults that protect sites

- robots.txt is honored, including `Crawl-delay`. `--ignore-robots` exists for sites you own or have permission to test. Do not use it to override a site operator's wishes.
- Requests are spaced per host (500 ms by default) and concurrency is 3.
- Crawls are bounded by `maxPages` and `maxDepth`.
- `discover` refuses sites whose robots.txt disallows everything.

## Your obligations

- Follow the terms of service of the sites you access and the laws that apply to you, including copyright, database rights and computer misuse and privacy laws.
- Do not copy, redistribute or republish content you do not have the right to use. Links, titles and structure are one thing; videos, images and full text are another.
- Do not bypass paywalls, authentication, technical protection measures or DRM. autocraw reports signs of protection such as encrypted HLS or DRM key systems; it does not break them.
- Do not use it for credential stuffing, scraping personal data without a lawful basis, harassment or disruption.
- Identify yourself where appropriate with a custom `--user-agent` that includes contact information.

## Running the server

`zac serve` fetches URLs on behalf of whoever can reach it. Keep it on `127.0.0.1` or behind authentication, and leave private address blocking on. See the [server API](../server-api.md) for the security model.

## AI providers

AI mode and `extract` send page content or report data to OpenAI or Anthropic. Check your provider terms and your data policies before sending third-party or confidential content.

## Reporting security issues

See `SECURITY.md` in the repository root.
