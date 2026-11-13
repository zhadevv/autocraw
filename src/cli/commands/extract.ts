import type { Command } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { AutocrawError } from '../../utils/errors';
import { readJsonFile } from '../../utils/fs-safe';
import { buildAiOptions, buildConfig } from '../parsers/args';
import type { CommonOptions, MarkdownCliOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { addAiOptions, addCommonOptions, emit } from './shared';

interface ExtractCliOptions extends CommonOptions, MarkdownCliOptions {
  schema?: string;
  schemaJson?: string;
  prompt?: string;
  full?: boolean;
  output?: string;
}

export function registerExtract(program: Command): void {
  const command = program
    .command('extract')
    .description('Extract structured JSON from pages with an AI model, validated against an optional JSON schema')
    .argument('<urls...>', 'page URLs')
    .option('--schema <file>', 'JSON schema file')
    .option('--schema-json <json>', 'inline JSON schema')
    .option('--prompt <text>', 'what to extract')
    .option('--full', 'include navigation, header, footer and sidebars')
    .option('-o, --output <file>', 'write output to a file');
  addCommonOptions(command);
  addAiOptions(command);
  command.action(async (urls: string[], options: ExtractCliOptions) => {
    let schema: Record<string, unknown> | undefined;
    if (options.schema) schema = await readJsonFile<Record<string, unknown>>(options.schema);
    else if (options.schemaJson) {
      try {
        schema = JSON.parse(options.schemaJson) as Record<string, unknown>;
      } catch (error) {
        throw new AutocrawError('E_INPUT', '--schema-json is not valid JSON.', {}, error);
      }
    }
    if (!schema && !options.prompt) throw new AutocrawError('E_INPUT', 'Provide --schema, --schema-json or --prompt.');
    const ai = buildAiOptions(options);
    const config = await buildConfig(options);
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    try {
      spinner.start(`Extracting with ${ai.provider}`);
      const results = await crawler.extract(urls, { ai, schema, prompt: options.prompt, onlyMainContent: !options.full, mode: options.mode });
      const failed = results.filter((item) => !item.ok).length;
      spinner.stop(`Extracted ${results.length - failed} of ${results.length} page(s)`, failed === 0);
      for (const item of results) {
        if (!item.ok) process.stderr.write(`${chalk.yellow('warning')} ${item.url}: ${item.errors.slice(0, 3).join('; ')}\n`);
        if (item.contentTruncated) process.stderr.write(`${chalk.yellow('warning')} ${item.url}: page content was truncated to fit the token budget\n`);
      }
      await emit(JSON.stringify(results.length === 1 ? results[0] : results, null, 2), options.output);
      if (failed > 0) process.exitCode = 1;
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await crawler.close();
    }
  });
}
