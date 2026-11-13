import type { SiteReport } from '../types';

export function toJson(report: SiteReport, pretty = true): string {
  return JSON.stringify(report, null, pretty ? 2 : 0);
}

export function toNdjson(items: unknown[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n') + (items.length > 0 ? '\n' : '');
}
