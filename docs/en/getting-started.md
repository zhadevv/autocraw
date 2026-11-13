# Getting started

## Requirements

- Node.js 22 or newer
- A Chrome or Chromium browser, only for pages that need JavaScript, actions or screenshots

## Install

```sh
npm install @zhadev/autocraw
```

Install globally to get the `zac` command (`autocraw` is an alias):

```sh
npm install -g @zhadev/autocraw
zac doctor
```

Without installing:

```sh
npx @zhadev/autocraw doctor
```

From a source checkout:

```sh
npm install && npm run build
node dist/cli.js doctor
```

## Browser setup

autocraw only starts a browser when it has to: anti-bot challenges, empty client-side rendered shells, actions and screenshots. Pick one option.

Option 1, download Playwright's Chromium:

```sh
npx playwright install chromium
```

Option 2, use a browser you already have. Set an absolute path to the binary:

```sh
AUTOCRAW_BROWSER_PATH=/usr/bin/google-chrome-stable
```

`~` is expanded, and a folder that contains a `chrome` binary is accepted. You can also pass `--browser-path`, or set `browserPath` in a config file. See [configuration](reference/config.md).

Run the environment check:

```sh
zac doctor
```

## Environment file

The CLI reads a `.env` file from the current directory. Copy `.env.example` and fill in what you need:

```
AUTOCRAW_BROWSER_PATH=
AUTOCRAW_PROXY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

## First commands

Scrape one page to Markdown:

```sh
zac scrape example.com
```

List the URLs of a site:

```sh
zac map example.com --search pricing
```

Analyze how a site is built and write a report:

```sh
zac discover your-site.example -o site.md --json-out report.json
```

Turn the saved report into an AI written document:

```sh
zac markdown report.json --markdown ai --api-key YOUR_KEY -o site.ai.md
```

## First library call

```ts
import { Autocraw } from '@zhadev/autocraw';

const crawler = new Autocraw({ mode: 'auto' });
try {
  const page = await crawler.scrape('example.com', { formats: ['markdown', 'links'] });
  console.log(page.markdown);
} finally {
  await crawler.close();
}
```

Always call `close()`. It shuts down the HTTP pool and the browser.

## Next steps

- [CLI reference](cli.md)
- [Library reference](library.md)
- [Responsible use](guides/responsible-use.md)
