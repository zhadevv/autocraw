import type { Section } from './types';
import { heading, inline } from '../formatters/code';
import { bulletList, keyValueList } from '../formatters/list';
import { table } from '../formatters/table';

export const robotsSection: Section = ({ report, t, maxExamples }) => {
  const parts: string[] = [heading(2, t.robots)];
  const robots = report.robots;
  parts.push(
    keyValueList([
      [t.robotsFound, robots.found ? t.yes : t.no],
      ['URL', robots.url],
      [t.crawlDelay, robots.crawlDelay === null ? '' : `${robots.crawlDelay}s`],
      [t.sitemapSources, robots.sitemaps.join(', ')],
    ]),
  );
  if (robots.disallowed.length > 0) {
    parts.push(`${t.disallowed}:`);
    parts.push(bulletList(robots.disallowed.slice(0, 20).map((path) => inline(path))));
  }
  const sitemap = report.sitemap;
  parts.push(keyValueList([[t.sitemapUrls, sitemap.found ? sitemap.totalUrls : t.none], [t.sitemapSources, sitemap.sources.join(', ')]]));
  if (sitemap.groups.length > 0) {
    parts.push(table([t.pattern, t.kind, t.count, t.example], sitemap.groups.slice(0, 15).map((g) => [inline(g.pattern), g.kind, g.count, g.examples.slice(0, Math.max(1, maxExamples - 2)).join(' ')])));
  }
  return parts.filter(Boolean).join('\n\n');
};
