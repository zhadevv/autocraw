import type { Command } from 'commander';
import chalk from 'chalk';
import { Session } from '../../core/session';
import { discoverSite } from '../../core/discovery';
import { generateMarkdown } from '../../markdown';
import { toJson } from '../../report/json';
import { intArg, buildConfig, buildMarkdownOptions } from '../parsers/args';
import type { CommonOptions, MarkdownCliOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { addCommonOptions, addCrawlLimits, addMarkdownOptions, emit } from './shared';
import { writeFileAtomic } from '../../utils/fs-safe';

interface DiscoverCliOptions extends CommonOptions, MarkdownCliOptions {
  output?: string;
  jsonOut?: string;
  json?: boolean;
  crawl?: boolean;
  probes?: boolean;
  crawlPages?: number;
  template?: string;
  quiet?: boolean;
}

export function registerDiscover(program: Command): void {
  const command = program
    .command('discover')
    .description('Analyze a site: tech stack, SSR/RSC, template, URL patterns, pagination, search, filters, media')
    .argument('<url>', 'site URL')
    .option('-o, --output <file>', 'write the Markdown report to a file')
    .option('--json-out <file>', 'also save the raw JSON report')
    .option('--json', 'print the raw JSON report instead of Markdown')
    .option('--no-crawl', 'skip the shallow crawl')
    .option('--no-probes', 'skip pagination/search/detail/watch probes')
    .option('--crawl-pages <n>', 'pages for the shallow crawl', intArg('crawl-pages', 1, 500))
    .option('--template <id>', 'force a site template (wordpress-animestream, wordpress-madara, generic)')
    .option('-q, --quiet', 'no progress output');
  addCommonOptions(command);
  addCrawlLimits(command);
  addMarkdownOptions(command);
  command.action(async (url: string, options: DiscoverCliOptions) => {
    const config = await buildConfig(options);
    const markdownOptions = options.json ? null : buildMarkdownOptions(options);
    const session = new Session(config);
    const spinner = new Spinner(!options.quiet);
    try {
      spinner.start('Starting');
      const report = await discoverSite(
        url,
        { template: options.template ?? null, crawl: options.crawl !== false, probes: options.probes !== false, crawlPages: options.crawlPages, onProgress: (step) => spinner.update(step) },
        session,
      );
      spinner.stop(`Analyzed ${report.origin}`);
      if (options.jsonOut) await writeFileAtomic(options.jsonOut, `${toJson(report)}\n`);
      if (options.json || !markdownOptions) {
        await emit(`${toJson(report)}\n`, options.output);
        return;
      }
      if (markdownOptions.mode === 'ai') spinner.start(`Generating Markdown with ${markdownOptions.ai?.provider}`);
      const result = await generateMarkdown(report, markdownOptions);
      if (markdownOptions.mode === 'ai') spinner.stop(result.cached ? 'Loaded Markdown from cache' : `Generated Markdown (${result.inputTokens ?? '?'} in / ${result.outputTokens ?? '?'} out tokens)`);
      for (const warning of result.warnings) process.stderr.write(`${chalk.yellow('warning')} ${warning}\n`);
      await emit(result.markdown, options.output);
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await session.close();
    }
  });
}
