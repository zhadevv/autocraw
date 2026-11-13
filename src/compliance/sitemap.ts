import type { HttpClient } from '../http/client';

export interface SitemapFetchResult {
  failures: Array<{ url: string; reason: string }>;
  sources: string[];
  urls: string[];
  truncated: boolean;
}

const LOC = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]*?)\s*(?:\]\]>)?\s*<\/loc>/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function parseSitemap(xml: string): { kind: 'index' | 'urlset' | 'unknown'; locs: string[] } {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const isUrlset = /<urlset[\s>]/i.test(xml);
  const locs: string[] = [];
  LOC.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LOC.exec(xml)) !== null) {
    const value = decodeEntities(match[1] ?? '').trim();
    if (value) locs.push(value);
  }
  return { kind: isIndex ? 'index' : isUrlset ? 'urlset' : 'unknown', locs };
}

export async function fetchSitemaps(
  client: HttpClient,
  origin: string,
  hints: string[],
  options: { maxUrls?: number; maxSitemaps?: number } = {},
): Promise<SitemapFetchResult> {
  const maxUrls = options.maxUrls ?? 5000;
  const maxSitemaps = options.maxSitemaps ?? 25;
  const defaults = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml'].map((path) => new URL(path, origin).toString());
  const queue = [...new Set([...hints, ...defaults])];
  const visited = new Set<string>();
  const sources: string[] = [];
  const failures: Array<{ url: string; reason: string }> = [];
  const guessed = new Set(defaults.filter((item) => !hints.includes(item)));
  const urls = new Set<string>();
  let truncated = false;

  while (queue.length > 0 && visited.size < maxSitemaps) {
    const next = queue.shift() as string;
    if (visited.has(next) || /\.gz($|\?)/i.test(next)) continue;
    visited.add(next);
    let body = '';
    try {
      const result = await client.get(next, { retries: 1, timeoutMs: 20000, accept: 'application/xml,text/xml,*/*;q=0.8' });
      if (result.status < 200 || result.status >= 300 || result.blocked) {
        if (!guessed.has(next)) failures.push({ url: next, reason: result.blocked ? `blocked (${result.blockReason ?? 'unknown'})` : `HTTP ${result.status}` });
        continue;
      }
      body = result.body;
    } catch (error) {
      if (!guessed.has(next)) failures.push({ url: next, reason: error instanceof Error ? error.message : 'request failed' });
      continue;
    }
    const parsed = parseSitemap(body);
    if (parsed.kind === 'unknown' && parsed.locs.length === 0) {
      if (!guessed.has(next)) failures.push({ url: next, reason: 'not a sitemap document' });
      continue;
    }
    sources.push(next);
    if (parsed.kind === 'index') {
      for (const loc of parsed.locs) if (!visited.has(loc)) queue.push(loc);
    } else {
      for (const loc of parsed.locs) {
        urls.add(loc);
        if (urls.size >= maxUrls) {
          truncated = true;
          break;
        }
      }
    }
    if (truncated) break;
  }
  return { failures, sources, urls: [...urls], truncated };
}
