import type { Section } from './types';
import { heading } from '../formatters/code';
import { bulletList, keyValueList } from '../formatters/list';
import { table } from '../formatters/table';

export const caveats: Section = ({ report, t }) => {
  const parts: string[] = [heading(2, t.caveats)];
  if (report.caveats.length > 0) parts.push(bulletList(report.caveats));
  else parts.push(t.none);
  if (report.crawl) {
    const stats = report.crawl.stats;
    parts.push(heading(3, t.crawlStats));
    const failed = report.crawl.errors.slice(0, 8);
    parts.push(
      keyValueList([
        [t.pagesFetched, stats.pagesFetched],
        [t.pagesFailed, stats.pagesFailed],
        [t.pagesSkipped, stats.pagesSkipped],
        [t.browserFetches, stats.browserFetches],
        ['Duration', `${stats.durationMs} ms`],
      ]),
    );
    if (failed.length > 0) parts.push(bulletList(failed.map((item) => `${item.url}: ${item.message}`)));
  }
  const timings = Object.entries(report.timings);
  if (timings.length > 0) {
    parts.push(heading(3, t.timings));
    parts.push(table([t.step, t.ms], timings.map(([step, ms]) => [step, ms])));
  }
  return parts.join('\n\n');
};
