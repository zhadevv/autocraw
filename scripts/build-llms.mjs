import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const files = [
  'en/index.md',
  'en/getting-started.md',
  'en/cli.md',
  'en/library.md',
  'en/server-api.md',
  'en/guides/scraping.md',
  'en/guides/discovery.md',
  'en/guides/extract.md',
  'en/guides/markdown-reports.md',
  'en/guides/templates.md',
  'en/guides/browser-and-anti-bot.md',
  'en/guides/intercept.md',
  'en/guides/local-models.md',
  'en/guides/responsible-use.md',
  'en/reference/config.md',
  'en/reference/report-schema.md',
  'en/reference/errors.md',
  'en/troubleshooting.md',
  'en/limitations.md',
  'en/development.md',
];

const parts = [];
for (const file of files) {
  const text = await readFile(join(root, file), 'utf8');
  parts.push(`Source: docs/${file}\n\n${text.trim()}`);
}
await writeFile(join(root, 'llms-full.txt'), `${parts.join('\n\n---\n\n')}\n`, 'utf8');
process.stdout.write(`Wrote docs/llms-full.txt from ${files.length} files\n`);
