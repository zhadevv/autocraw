import type { Command } from 'commander';
import chalk from 'chalk';
import { generateMarkdown } from '../../markdown';
import type { SiteReport } from '../../types';
import { AutocrawError } from '../../utils/errors';
import { readJsonFile } from '../../utils/fs-safe';
import { buildMarkdownOptions } from '../parsers/args';
import type { MarkdownCliOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { addMarkdownOptions, emit } from './shared';

interface MarkdownCommandOptions extends MarkdownCliOptions {
  output?: string;
  mode?: 'default' | 'ai';
}

export function registerMarkdown(program: Command): void {
  const command = program
    .command('markdown')
    .description('Turn a saved JSON report into Markdown, deterministically or with AI')
    .argument('<report>', 'JSON report produced by discover --json-out')
    .option('-o, --output <file>', 'write the Markdown to a file')
    .option('--mode <mode>', 'alias for --markdown');
  addMarkdownOptions(command);
  command.action(async (file: string, options: MarkdownCommandOptions) => {
    if (options.mode) options.markdown = options.mode;
    const report = await readJsonFile<SiteReport>(file);
    if (!report || typeof report !== 'object' || !report.techstack || !report.origin) {
      throw new AutocrawError('E_INPUT', `${file} is not an autocraw report. Create one with: autocraw discover <url> --json-out report.json`);
    }
    const markdownOptions = buildMarkdownOptions(options);
    const spinner = new Spinner(markdownOptions.mode === 'ai');
    try {
      if (markdownOptions.mode === 'ai') spinner.start(`Generating Markdown with ${markdownOptions.ai?.provider}`);
      const result = await generateMarkdown(report, markdownOptions);
      if (markdownOptions.mode === 'ai') spinner.stop(result.cached ? 'Loaded Markdown from cache' : `Generated Markdown (${result.inputTokens ?? '?'} in / ${result.outputTokens ?? '?'} out tokens)`);
      for (const warning of result.warnings) process.stderr.write(`${chalk.yellow('warning')} ${warning}\n`);
      await emit(result.markdown, options.output);
    } catch (error) {
      spinner.stop();
      throw error;
    }
  });
}
