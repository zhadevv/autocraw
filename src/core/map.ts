import type { MapLink, MapResult } from '../types';
import type { Session } from './session';
import { classifyUrl } from '../classify/taxonomy';
import { fetchSitemaps } from '../compliance/sitemap';
import { extractLinks } from '../extractors/links';
import { fastExtract } from '../extractors/fast';
import { parseHtml } from '../utils/dom';
import { toMessage } from '../utils/errors';
import { ensureUrl, normalizeUrl } from '../utils/normalize-url';

export interface MapOptions {
  search?: string;
  limit?: number;
  sitemap?: 'include' | 'only' | 'skip';
  includeSubdomains?: boolean;
}

function rootHost(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

function inScope(candidate: string, base: URL, includeSubdomains: boolean): boolean {
  try {
    const host = rootHost(new URL(candidate).hostname);
    const root = rootHost(base.hostname);
    return host === root || (includeSubdomains && host.endsWith(`.${root}`));
  } catch {
    return false;
  }
}

function score(link: MapLink, terms: string[]): number {
  const url = link.url.toLowerCase();
  const title = (link.title ?? '').toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (url.includes(term)) total += 2;
    if (title.includes(term)) total += 1;
  }
  return total;
}

export async function mapSite(session: Session, input: string, options: MapOptions = {}): Promise<MapResult> {
  const start = ensureUrl(input);
  const base = new URL(start);
  const limit = Math.max(1, Math.min(options.limit ?? 5000, 100000));
  const mode = options.sitemap ?? 'include';
  const includeSubdomains = options.includeSubdomains ?? false;
  const warnings: string[] = [];
  const found = new Map<string, MapLink>();
  const sitemaps: string[] = [];

  const add = (raw: string, title: string | null, source: MapLink['source']): void => {
    const normalized = normalizeUrl(raw);
    if (!normalized || found.has(normalized)) return;
    if (!inScope(normalized, base, includeSubdomains) || classifyUrl(normalized) === 'asset') return;
    found.set(normalized, { url: normalized, title: title || null, source });
  };

  const robots = await session.robots.load(base.origin);
  if (mode !== 'skip') {
    const result = await fetchSitemaps(session.client, base.origin, robots.policy.sitemaps, { maxUrls: Math.max(limit * 2, 5000) });
    sitemaps.push(...result.sources);
    for (const url of result.urls) add(url, null, 'sitemap');
    if (result.failures.length > 0) warnings.push(`${result.failures.length} sitemap file(s) could not be read: ${result.failures.slice(0, 3).map((item) => `${item.url} (${item.reason})`).join('; ')}.`);
    if (mode === 'only' && result.sources.length === 0) warnings.push('No sitemap was found for this site.');
  }

  if (mode !== 'only') {
    try {
      const result = await session.fetch(start);
      if (result.status >= 400) warnings.push(`The start page returned HTTP ${result.status}.`);
      else {
        const links = fastExtract(result.body, result.finalUrl)?.links ?? extractLinks(parseHtml(result.body, result.finalUrl), result.finalUrl);
        for (const link of links) if (link.internal || includeSubdomains) add(link.url, link.text, 'page');
      }
    } catch (error) {
      warnings.push(`Could not read the start page: ${toMessage(error)}`);
    }
  }

  let links = [...found.values()];
  if (session.config.respectRobots) links = links.filter((link) => robots.policy.isAllowed(link.url));
  const terms = (options.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length > 0) {
    links = links
      .map((link) => ({ link, value: score(link, terms) }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value || a.link.url.length - b.link.url.length)
      .map((item) => item.link);
  }
  const total = links.length;
  return { url: start, total, truncated: total > limit, links: links.slice(0, limit), sitemaps, warnings };
}
