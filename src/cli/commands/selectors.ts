import type { Command } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { buildConfig, collect } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { renderTable } from '../ui/table';
import { addCommonOptions, emit } from './shared';

interface SelectorsCliOptions extends CommonOptions {
  also?: string[];
  json?: boolean;
  output?: string;
}

function printReport(label: string, report: import('../../classify/selector-finder').SelectorReport, lines: string[]): void {
  lines.push(chalk.bold(`\n${label}`));
  if (report.title) lines.push(`  title             ${chalk.cyan('title')}  "${report.title.sample.text}"`);
  if (report.heading) lines.push(`  heading           ${chalk.cyan(report.heading.selector)}  "${report.heading.sample.text}"`);
  if (report.cards.length > 0) {
    lines.push('  cards');
    lines.push(renderTable(['selector', 'count', 'title', 'link', 'image', 'sample'], report.cards.map((card) => [card.selector, String(card.count), card.titleSelector ?? '', card.linkSelector ?? 'a[href]', card.imageSelector ?? '', String(card.sample.title ?? '')])));
  }
  if (report.pagination) lines.push(`  pagination        container ${chalk.cyan(report.pagination.containerSelector)}  next ${report.pagination.nextSelector ?? '-'}`);
  if (report.search) lines.push(`  search            form ${report.search.formSelector ?? '-'}  input ${chalk.cyan(report.search.inputSelector)}`);
  if (report.filters.length > 0) lines.push(renderTable(['filter selector', 'type', 'options'], report.filters.map((filter) => [filter.selector, filter.type, String(filter.optionCount)])));
  if (report.media.iframeSelector) lines.push(`  player iframe     ${chalk.cyan(report.media.iframeSelector.selector)}  (${report.media.iframeSelector.count})`);
  if (report.media.mirrorSelectSelector) lines.push(`  mirror <select>   ${chalk.cyan(report.media.mirrorSelectSelector.selector)}`);
  for (const dl of report.media.downloadLinkSelectors) lines.push(`  download links    ${chalk.cyan(dl.selector)}  (${dl.count})`);
  if (report.attributePairs) lines.push(`  attribute pairs   ${chalk.cyan(report.attributePairs.selector)}  (${report.attributePairs.count}) e.g. ${JSON.stringify(report.attributePairs.sample)}`);
}

export function registerSelectors(program: Command): void {
  const command = program
    .command('selectors')
    .description('Find the CSS selectors for a page: title, listing cards, pagination, search, filters, player and download links')
    .argument('<url>', 'page URL, usually a home or listing page')
    .option('--also <url>', 'also inspect this URL, for example a detail or watch page (repeatable)', collect, [] as string[])
    .option('--json', 'print JSON instead of a readable summary')
    .option('-o, --output <file>', 'write output to a file');
  addCommonOptions(command);
  command.action(async (url: string, options: SelectorsCliOptions) => {
    const config = await buildConfig(options);
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    try {
      spinner.start('Finding selectors');
      const result = await crawler.selectors(url, options.also ?? []);
      spinner.stop(`Found selectors on ${result.home.url}${result.extra.length > 0 ? ` and ${result.extra.length} more page(s)` : ''}`);
      if (options.json) return emit(JSON.stringify(result, null, 2), options.output);
      const lines: string[] = [];
      printReport(result.home.url, result.home, lines);
      for (const item of result.extra) printReport(item.url, item.report, lines);
      await emit(lines.join('\n'), options.output);
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await crawler.close();
    }
  });
}
