import type { MarkdownOptionsInput, MarkdownResult, SiteReport } from '../types';
import { generateMarkdown } from '../markdown';

export function reportToMarkdown(report: SiteReport, options: MarkdownOptionsInput = {}, signal?: AbortSignal): Promise<MarkdownResult> {
  return generateMarkdown(report, options, signal);
}
