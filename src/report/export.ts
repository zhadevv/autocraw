import type { MarkdownOptionsInput, SiteReport } from '../types';
import { AutocrawError } from '../utils/errors';
import { pagesCsv, urlGroupsCsv } from './csv';
import { toJson } from './json';
import { reportToMarkdown } from './markdown';

export type ExportFormat = 'json' | 'markdown' | 'csv-urls' | 'csv-pages';

export const EXPORT_FORMATS: ExportFormat[] = ['json', 'markdown', 'csv-urls', 'csv-pages'];

export async function exportReport(report: SiteReport, format: ExportFormat, markdown: MarkdownOptionsInput = {}): Promise<string> {
  switch (format) {
    case 'json':
      return `${toJson(report)}\n`;
    case 'markdown':
      return (await reportToMarkdown(report, markdown)).markdown;
    case 'csv-urls':
      return urlGroupsCsv(report);
    case 'csv-pages':
      if (!report.crawl) throw new AutocrawError('E_INPUT', 'This report has no crawl data; run discover without --no-crawl or use the crawl command.');
      return pagesCsv(report);
    default:
      throw new AutocrawError('E_INPUT', `Unknown export format "${String(format)}". Use one of: ${EXPORT_FORMATS.join(', ')}.`);
  }
}
