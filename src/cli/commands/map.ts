import type { Command } from 'commander';
import { Option } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { buildConfig, intArg } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { addCommonOptions, emit } from './shared';

interface MapCliOptions extends CommonOptions {
  search?: string;
  limit?: number;
  sitemapMode?: 'include' | 'only' | 'skip';
  subdomains?: boolean;
  json?: boolean;
  output?: string;
}

export function registerMap(program: Command): void {
  const command = program
    .command('map')
    .description('List the URLs of a site quickly, using sitemaps and the start page links')
    .argument('<url>', 'site URL')
    .option('--search <terms>', 'keep only URLs or titles matching these terms, best matches first')
    .option('--limit <n>', 'maximum URLs to return', intArg('limit', 1, 100000))
    .addOption(new Option('--sitemap-mode <mode>', 'sitemap usage').choices(['include', 'only', 'skip']).default('include'))
    .option('--subdomains', 'include subdomains of the site')
    .option('--json', 'print JSON with titles and sources')
    .option('-o, --output <file>', 'write output to a file');
  addCommonOptions(command);
  command.action(async (url: string, options: MapCliOptions) => {
    const config = await buildConfig(options);
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    try {
      spinner.start('Mapping');
      const result = await crawler.map(url, { search: options.search, limit: options.limit, sitemap: options.sitemapMode, includeSubdomains: options.subdomains });
      spinner.stop(`Found ${result.total} URL(s)${result.truncated ? `, showing ${result.links.length}` : ''}`);
      for (const warning of result.warnings) process.stderr.write(`${chalk.yellow('warning')} ${warning}\n`);
      if (options.json) return emit(JSON.stringify(result, null, 2), options.output);
      await emit(result.links.map((link) => link.url).join('\n'), options.output);
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await crawler.close();
    }
  });
}
