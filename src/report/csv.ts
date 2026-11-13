import type { SiteReport } from '../types';

function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n') + '\r\n';
}

export function urlGroupsCsv(report: SiteReport): string {
  return toCsv(
    ['pattern', 'kind', 'count', 'example'],
    report.urlGroups.map((group) => [group.pattern, group.kind, group.count, group.examples[0] ?? '']),
  );
}

export function pagesCsv(report: SiteReport): string {
  const pages = report.crawl?.pages ?? [];
  return toCsv(
    ['url', 'final_url', 'status', 'depth', 'kind', 'title', 'via', 'duration_ms', 'links', 'error'],
    pages.map((page) => [page.url, page.finalUrl, page.status, page.depth, page.kind, page.title, page.via, page.durationMs, page.linkCount, page.error]),
  );
}
