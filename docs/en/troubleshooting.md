# Troubleshooting

Start with `zac doctor`. It checks Node.js, Playwright, the browser, API keys and network access.

## Build and install

**`tsup: not found` after cloning**
Run `npm install` first. The build tools are dev dependencies.

**`npm run build` fails in the declaration step with a `ReadableStream` type error**
Fixed in the current source. Update to the latest code. Do not remove `DOM` from `tsconfig.json` `lib`; the DOM extractors need its types.

## Browser

**`Chromium browser: not installed`**
Run `npx playwright install chromium`, or set `AUTOCRAW_BROWSER_PATH` to an existing Chrome or Chromium.

**`Invalid browser path: ... is a directory without a Chrome/Chromium binary inside`**
The path points to a folder that has no browser binary. Point to the binary itself, for example `/opt/google/chrome/chrome`.

**`Invalid browser path: ... does not exist`**
Check the path. `~` is expanded in `.env` and flags, but a typo is still a typo.

**The browser starts but pages fail to load, or it crashes on launch**
Missing system libraries are the usual cause on minimal Linux images and containers. The error message includes the first line from the browser. Install the libraries it names, or use `npx playwright install-deps chromium`. autocraw already passes `--no-sandbox`.

## Fetching

**`E_BLOCKED` (exit code 3)**
The site served a challenge or forbade the request. Try `--mode browser`, `--headed`, a slower `--delay`, a permitted proxy, or reconsider whether you should crawl that site. See [browser and anti-bot](guides/browser-and-anti-bot.md).

**`E_ROBOTS` (exit code 3)**
robots.txt disallows the URL. Respect it unless you own the site.

**`E_TIMEOUT`**
Raise `--timeout`, or try `--mode browser` for slow pages.

**Markdown is empty or very short**
The page is probably rendered by JavaScript. Run `zac inspect <url> --compare`, then use `--mode browser` and `--wait <selector>`. Also try `--full` in case main-content detection removed the content.

**Markdown contains menus and footers**
That is expected with `--full`. Without it, use `--include-tag` to pick the content element.

## CLI usage

**`option '-f, --format <formats>' argument ... is invalid`**
Formats are `markdown`, `html`, `text`, `links`, `images`, `metadata`, `screenshot`. Combine them with commas: `-f markdown,links`.

**`Refusing to listen on 0.0.0.0 without authentication`**
Pass `--key` or set `AUTOCRAW_SERVER_KEY` when binding beyond localhost.

## Discovery

**Sitemap shows 0 URLs although a sitemap index was found**
The child sitemap files could not be read. The report's caveats list each failing file and why (for example HTTP 403 or blocked). Run `zac map <site> --sitemap-mode only` for the same diagnostics.

**Template is `generic`**
No template reached confidence 0.5. Force one with `--template wordpress-animestream` or `--template wordpress-madara`, or [write a template](guides/templates.md).

**Pagination detected but not verified**
Page 2 could not be fetched, or returned the same items. Check the caveats and try `zac probe pagination <site>`.

**Search could not be verified**
The sample query returned no recognizable result cards. The site may use a custom search page or a live-search API only.

## AI

**`E_AI_AUTH`**
The key was rejected, or the account has no quota. Check the key, and that it can use the chosen model.

**`E_AI_CONTEXT`**
The report is too large for the model's budget. Lower `--crawl-pages`, run with `--no-probes`, or raise `--ai-max-input` if the model allows.

**The AI document looks cut off**
The model reached the output limit. Raise `--ai-max-output`.

**Results are not changing between runs**
They are cached by content. Use `--no-cache`, or change the prompt-affecting options.

## Still stuck

Run the command with `-v` and open an issue with the output, your Node.js version and the command line. Remove API keys and private URLs first.
