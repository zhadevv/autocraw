import type { Command } from 'commander';
import { Autocraw } from '../../index';
import { parseActions } from '../../browser/actions';
import { readJsonFile, writeBufferAtomic } from '../../utils/fs-safe';
import { buildConfig, collect, intArg } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { parseFormats } from '../parsers/formats';
import type { ScrapeFormat } from '../parsers/formats';
import { Spinner } from '../ui/spinner';
import { addCommonOptions, emit } from './shared';

interface ScrapeCliOptions extends CommonOptions {
  format?: ScrapeFormat[];
  full?: boolean;
  wait?: string;
  waitMs?: number;
  actions?: string;
  screenshot?: string;
  fullPage?: boolean;
  includeTag?: string[];
  excludeTag?: string[];
  output?: string;
}

export function registerScrape(program: Command): void {
  const command = program
    .command('scrape')
    .description('Scrape one page into LLM-ready Markdown (or html, text, links, images, metadata, screenshot)')
    .argument('<url>', 'page URL')
    .option('-f, --format <formats>', 'comma separated or repeated: markdown, html, text, links, images, metadata, screenshot (default: markdown)', parseFormats)
    .option('--full', 'include navigation, header, footer and sidebars')
    .option('--include-tag <selector>', 'only keep elements matching this CSS selector (repeatable)', collect, [] as string[])
    .option('--exclude-tag <selector>', 'drop elements matching this CSS selector (repeatable)', collect, [] as string[])
    .option('--wait <selector>', 'CSS selector to wait for in browser mode')
    .option('--wait-ms <ms>', 'wait this long after load (uses the browser)', intArg('wait-ms', 0, 30000))
    .option('--actions <file>', 'JSON file with browser actions: wait, click, type, press, scroll, hover, select')
    .option('--screenshot <file>', 'save a PNG screenshot to this file (uses the browser)')
    .option('--full-page', 'capture the full page in the screenshot')
    .option('-o, --output <file>', 'write output to a file');
  addCommonOptions(command);
  command.action(async (url: string, options: ScrapeCliOptions) => {
    const formats: ScrapeFormat[] = options.format && options.format.length > 0 ? [...options.format] : ['markdown'];
    if (options.screenshot && !formats.includes('screenshot')) formats.push('screenshot');
    const actions = options.actions ? parseActions(await readJsonFile<unknown>(options.actions)) : undefined;
    const config = await buildConfig(options);
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    try {
      spinner.start('Scraping');
      const result = await crawler.scrape(url, {
        formats,
        onlyMainContent: !options.full,
        includeTags: options.includeTag,
        excludeTags: options.excludeTag,
        waitForSelector: options.wait,
        waitFor: options.waitMs,
        actions,
        fullPage: options.fullPage,
      });
      spinner.stop(`Scraped ${result.finalUrl} (HTTP ${result.status}, via ${result.via})`);
      if (options.screenshot && result.screenshot) {
        await writeBufferAtomic(options.screenshot, Buffer.from(result.screenshot, 'base64'));
        process.stderr.write(`Saved ${options.screenshot}\n`);
        delete result.screenshot;
      }
      const only = formats.filter((format) => !(format === 'screenshot' && options.screenshot));
      if (only.length === 1 && only[0] === 'markdown') return emit(result.markdown ?? '', options.output);
      await emit(JSON.stringify(result, null, 2), options.output);
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await crawler.close();
    }
  });
}
