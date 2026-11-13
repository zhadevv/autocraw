import type { Command } from 'commander';
import { Option } from 'commander';
import { EXPORT_FORMATS, exportReport } from '../../report/export';
import type { ExportFormat } from '../../report/export';
import type { SiteReport } from '../../types';
import { AutocrawError } from '../../utils/errors';
import { readJsonFile } from '../../utils/fs-safe';
import { buildMarkdownOptions } from '../parsers/args';
import type { MarkdownCliOptions } from '../parsers/args';
import { emit } from './shared';

interface ExportCliOptions extends MarkdownCliOptions {
  format: ExportFormat;
  output?: string;
}

export function registerExport(program: Command): void {
  program
    .command('export')
    .description('Export a saved JSON report as JSON, Markdown or CSV')
    .argument('<report>', 'JSON report produced by discover --json-out')
    .addOption(new Option('-f, --format <format>', 'export format').choices(EXPORT_FORMATS).default('markdown'))
    .option('-o, --output <file>', 'write output to a file')
    .addOption(new Option('--lang <code>', 'markdown language').choices(['en', 'id']).default('en'))
    .addOption(new Option('--md-template <name>', 'markdown template').choices(['site-structure', 'seo-audit', 'techstack']).default('site-structure'))
    .action(async (file: string, options: ExportCliOptions) => {
      const report = await readJsonFile<SiteReport>(file);
      if (!report || typeof report !== 'object' || !report.techstack) throw new AutocrawError('E_INPUT', `${file} is not an autocraw report.`);
      const content = await exportReport(report, options.format, buildMarkdownOptions({ ...options, markdown: 'default' }));
      await emit(content, options.output);
    });
}
