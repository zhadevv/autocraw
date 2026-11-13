import type { Command } from 'commander';
import { Argument } from 'commander';
import { Autocraw } from '../../index';
import { buildConfig } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { AutocrawError } from '../../utils/errors';
import { addCommonOptions, emit } from './shared';

const TARGETS = ['pagination', 'search', 'filter', 'detail', 'watch', 'read'] as const;

interface ProbeCliOptions extends CommonOptions {
  template?: string;
  output?: string;
}

export function registerProbe(program: Command): void {
  const command = program
    .command('probe')
    .description('Run a single probe against a site and print its JSON result')
    .addArgument(new Argument('<what>', 'probe to run').choices([...TARGETS]))
    .argument('<url>', 'site URL')
    .option('--template <id>', 'force a site template')
    .option('-o, --output <file>', 'write output to a file');
  addCommonOptions(command);
  command.action(async (what: (typeof TARGETS)[number], url: string, options: ProbeCliOptions) => {
    const config = await buildConfig(options);
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    try {
      spinner.start(`Probing ${what}`);
      const report = await crawler.discover(url, { template: options.template ?? null, crawl: false, probes: true, onProgress: (step) => spinner.update(step) });
      spinner.stop(`Probe ${what} finished`);
      const map = { pagination: report.pagination, search: report.search, filter: report.filters, detail: report.detail, watch: report.watch, read: report.read };
      const value = map[what];
      if (value === null || value === undefined) {
        throw new AutocrawError('E_INPUT', `The ${what} probe produced no data for this site. Caveats: ${report.caveats.join(' | ') || 'none'}`);
      }
      await emit(JSON.stringify(value, null, 2), options.output);
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await crawler.close();
    }
  });
}
