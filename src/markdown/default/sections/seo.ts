import type { Section } from './types';
import { heading } from '../formatters/code';
import { bulletList } from '../formatters/list';
import { table } from '../formatters/table';

export const seo: Section = ({ report, t }) => {
  const data = report.home.seo;
  if (!data) return `${heading(2, t.seo)}\n\n${t.noData}`;
  const parts: string[] = [heading(2, t.seo)];
  parts.push(
    table(
      [t.field, t.value],
      [
        ['Title', `${data.title ?? ''} (${data.titleLength})`],
        ['Meta description', `${data.description ?? ''} (${data.descriptionLength})`],
        ['Canonical', data.canonical ?? ''],
        ['Robots meta', data.robots ?? ''],
        ['Language', data.lang ?? ''],
        ['Viewport', data.viewport ?? ''],
        ['H1', data.h1.join(' / ')],
        ['Headings', Object.entries(data.headingCount).map(([k, v]) => `${k}:${v}`).join(' ')],
        ['Images (missing alt)', `${data.imagesTotal} (${data.imagesMissingAlt})`],
        ['Internal / external links', `${data.internalLinks} / ${data.externalLinks}`],
        ['Word count', data.wordCount],
        ['JSON-LD types', data.jsonLdTypes.join(', ')],
        ['Open Graph keys', Object.keys(data.openGraph).join(', ')],
        ['Twitter card keys', Object.keys(data.twitter).join(', ')],
        ['hreflang', data.hreflang.map((item) => item.lang).join(', ')],
      ],
    ),
  );
  if (data.issues.length > 0) {
    parts.push(heading(3, t.issue));
    parts.push(bulletList(data.issues));
  }
  return parts.join('\n\n');
};
