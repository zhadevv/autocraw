import type { MarkdownLanguage, SiteReport } from '../../../types';
import type { Labels } from '../i18n';

export interface SectionContext {
  report: SiteReport;
  language: MarkdownLanguage;
  t: Labels;
  maxExamples: number;
}

export type Section = (ctx: SectionContext) => string | null;
