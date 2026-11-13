import type { Command } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { readTextFile } from '../../utils/fs-safe';
import { toNdjson } from '../../report/json';
import { buildConfig, collect, intArg } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { parseFormats } from '../parsers/formats';
import type { ScrapeFormat } from '../parsers/formats';
import { Spinner } from '../ui/spinner';
import { addCommonOptions, emit } from './shared';

interface BatchCliOptions extends CommonOptions {
  file?: string;
  format?: ScrapeFormat[];
  full?: boolean;
  includeTag?: string[];
  excludeTag?: string[];
  batchConcurrency?: number;
  output?: string;
}

export function registerBatch(program: Command): void {
  const command = program
    .command('batch')
    .description('Scrape many URLs in parallel and print one JSON object per line')
    .argument('[urls...]', 'URLs to scrape')
    .option('--file <path>', 'read URLs from a text file, one per line')
    .option('-f, --format <formats>', 'comma separated or repeated: markdown, html, text, links, images, metadata (default: markdown)', parseFormats)
    .option('--full', 'include navigation, header, footer and sidebars')
    .option('--include-tag <selector>', 'only keep elements matching this CSS selector (repeatable)', collect, [] as string[])
    .option('--exclude-tag <selector>', 'drop elements matching this CSS selector (repeatable)', collect, [] as string[])
    .option('--batch-concurrency <n>', 'parallel scrapes (default: --concurrency)', intArg('batch-concurrency', 1, 32))
    .option('-o, --output <file>', 'write NDJSON to a file');
  addCommonOptions(command);
  command.action(async (urls: string[], options: BatchCliOptions) => {
    const list = [...urls];
    if (options.file) {
      const text = await readTextFile(options.file);
      list.push(...text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('\u0023')));
    }
    if (list.length === 0) throw new Error('Provide at least one URL or --file.');
    const formats: ScrapeFormat[] = options.format && options.format.length > 0 ? options.format : ['markdown'];
    const config = await buildConfig(options);
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    let done = 0;
    crawler.on('item', (item: { url: string; ok: boolean }) => {
      done += 1;
      spinner.update(`${done}/${list.length} ${item.ok ? '' : 'failed '}${item.url}`);
    });
    try {
      spinner.start('Scraping');
      const results = await crawler.batchScrape(list, {
        concurrency: options.batchConcurrency,
        scrape: { formats, onlyMainContent: !options.full, includeTags: options.includeTag, excludeTags: options.excludeTag },
      });
      const failed = results.filter((item) => !item.ok).length;
      spinner.stop(`Scraped ${results.length - failed} of ${results.length} URL(s)`, failed === 0);
      if (failed > 0) process.stderr.write(`${chalk.yellow('warning')} ${failed} URL(s) failed; see the error field in the output.\n`);
      await emit(toNdjson(results), options.output);
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await crawler.close();
    }
  });
}
