import type { MarkdownOptions, MarkdownTemplateName, SiteReport } from '../../types';
import { labels } from './i18n';
import { heading } from './formatters/code';
import { renderLayout } from './templates';
import type { Section } from './sections/types';
import { overview } from './sections/overview';
import { techstack } from './sections/techstack';
import { seo } from './sections/seo';
import { robotsSection } from './sections/robots';
import { urlPatterns } from './sections/url-patterns';
import { pagination } from './sections/pagination';
import { searchSection } from './sections/search';
import { filtersSection } from './sections/filters';
import { detailPages } from './sections/detail-pages';
import { watchPages } from './sections/watch-pages';
import { mediaSection } from './sections/media';
import { caveats } from './sections/caveats';

const TEMPLATE_SECTIONS: Record<MarkdownTemplateName, Section[]> = {
  'site-structure': [overview, techstack, urlPatterns, pagination, searchSection, filtersSection, detailPages, watchPages, mediaSection, robotsSection, seo, caveats],
  'seo-audit': [overview, seo, robotsSection, urlPatterns, caveats],
  techstack: [overview, techstack, mediaSection, caveats],
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function buildToc(sections: string[]): string | null {
  const hash = '\u0023';
  const entries: string[] = [];
  for (const section of sections) {
    for (const line of section.split('\n')) {
      const match = new RegExp(`^${hash}{2,3} (.+)$`).exec(line);
      if (!match) continue;
      const level = line.startsWith(`${hash}${hash}${hash}`) ? 1 : 0;
      entries.push(`${'  '.repeat(level)}- [${match[1]}](${hash}${slugify(match[1] as string)})`);
    }
  }
  return entries.length > 2 ? entries.join('\n') : null;
}

export function buildFrontmatter(report: SiteReport, options: Pick<MarkdownOptions, 'template' | 'language'>, extra: Record<string, string> = {}): string {
  const pairs: Array<[string, string]> = [
    ['generator', 'autocraw'],
    ['version', report.version],
    ['target', report.target],
    ['generated', report.generatedAt],
    ['template', options.template],
    ['language', options.language],
    ...Object.entries(extra),
  ];
  return pairs.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
}

export function generateDefaultMarkdown(report: SiteReport, options: MarkdownOptions): string {
  const t = labels(options.language);
  const ctx = { report, language: options.language, t, maxExamples: options.maxExamples };
  const sections = TEMPLATE_SECTIONS[options.template].map((section) => section(ctx)).filter((value): value is string => Boolean(value));
  const hostname = new URL(report.origin).hostname;
  const titleText = options.template === 'seo-audit' ? t.titleSeo : options.template === 'techstack' ? t.titleTech : t.title;
  return renderLayout({
    frontmatter: options.frontmatter ? buildFrontmatter(report, options, { mode: 'default' }) : null,
    title: heading(1, `${titleText}: ${hostname}`),
    toc: options.toc ? buildToc(sections) : null,
    sections,
    footer: `---\n\n*${t.generatedBy} ${report.version}.*`,
  });
}
