import type { Command } from 'commander';
import { Option } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { toNdjson } from '../../report/json';
import { buildConfig, intArg } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { renderTable } from '../ui/table';
import { addCommonOptions, addCrawlLimits, emit } from './shared';

interface CrawlCliOptions extends CommonOptions {
  output?: string;
  format?: 'table' | 'json' | 'ndjson';
  perPattern?: number;
  noSeo?: boolean;
  quiet?: boolean;
}

export function registerCrawl(program: Command): void {
  const command = program
    .command('crawl')
    .description('Crawl a site breadth-first and list pages with their classified kind')
    .argument('<url>', 'start URL')
    .addOption(new Option('--format <format>', 'output format').choices(['table', 'json', 'ndjson']).default('table'))
    .option('-o, --output <file>', 'write output to a file')
    .option('--per-pattern <n>', 'limit pages per URL pattern', intArg('per-pattern', 1, 10000))
    .option('--no-seo', 'skip per-page SEO analysis (faster)')
    .option('-q, --quiet', 'no progress output');
  addCommonOptions(command);
  addCrawlLimits(command);
  command.action(async (url: string, options: CrawlCliOptions & { seo?: boolean }) => {
    const config = await buildConfig(options);
    const crawler = new Autocraw(config);
    const spinner = new Spinner(!options.quiet);
    let count = 0;
    try {
      spinner.start('Crawling');
      const result = await crawler.crawl(url, {
        perPatternLimit: options.perPattern,
        computeSeo: options.seo !== false,
        onPage: (page) => {
          count += 1;
          spinner.update(`Crawled ${count}: ${page.finalUrl}`);
        },
      });
      spinner.stop(`Crawled ${result.stats.pagesFetched} pages (${result.stats.pagesFailed} failed, ${result.stats.pagesSkipped} skipped) in ${(result.stats.durationMs / 1000).toFixed(1)}s`);
      if (options.format === 'json') return emit(JSON.stringify(result, null, 2), options.output);
      if (options.format === 'ndjson') return emit(toNdjson(result.pages), options.output);
      const rows = result.pages
        .sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url))
        .map((page) => [String(page.status || '-'), page.kind, String(page.depth), page.via, page.title ?? '', page.finalUrl]);
      await emit(renderTable(['Status', 'Kind', 'Depth', 'Via', 'Title', 'URL'], rows, 70), options.output);
      for (const error of result.errors.slice(0, 5)) process.stderr.write(`${chalk.yellow('failed')} ${error.url}: ${error.message}\n`);
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await crawler.close();
    }
  });
}
