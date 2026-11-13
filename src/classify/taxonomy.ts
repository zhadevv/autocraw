import type { PageKind, SiteTemplate, UrlGroup } from '../types';

const STATIC_SLUGS = new Set(['about', 'about-us', 'contact', 'contact-us', 'privacy', 'privacy-policy', 'terms', 'terms-of-service', 'tos', 'dmca', 'disclaimer', 'faq', 'help', 'cookie-policy', 'sitemap', 'request', 'donate']);
const ASSET_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|map|woff2?|ttf|otf|eot|mp4|webm|mp3|m3u8|ts|zip|rar|7z|pdf)$/i;
const FEED_HINT = /\/(?:feed|rss|atom)(?:\/|$)|\.(?:rss|atom|xml)$/i;
const SEARCH_PARAMS = ['s', 'q', 'query', 'search', 'keyword', 'keywords', 'k'];

export function patternKey(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean).map((segment) => {
    let value: string;
    try {
      value = decodeURIComponent(segment);
    } catch {
      value = segment;
    }
    if (/^\d+$/.test(value)) return '{id}';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return '{uuid}';
    if (/^[0-9a-f]{24,}$/i.test(value)) return '{hash}';
    if (/^\d{4}$/.test(value) && Number(value) >= 1990 && Number(value) <= 2100) return '{year}';
    if (/^page$/i.test(value)) return 'page';
    if (/^(chapter|episode|ep|ch|season|volume|vol)[-_ ]?\d+/i.test(value)) return `${value.replace(/\d+.*$/, '')}{n}`;
    if (/[-_]\d+(?:[-_]\d+)*(?:-(?:subtitle|sub)-[a-z]+)?$/i.test(value) && value.length > 8) return '{slug-n}';
    if (value.length > 24 || (value.includes('-') && value.length > 12)) return '{slug}';
    return value;
  });
  const path = parts.length === 0 ? '/' : `/${parts.join('/')}`;
  const queryKeys = [...new Set([...url.searchParams.keys()])].sort();
  const query = queryKeys.length > 0 ? `?${queryKeys.map((key) => `${key}=*`).join('&')}` : '';
  return `${path}${query}`;
}

export function classifyUrl(input: string | URL, template?: SiteTemplate | null): PageKind {
  let url: URL;
  try {
    url = typeof input === 'string' ? new URL(input) : input;
  } catch {
    return 'other';
  }
  if (ASSET_EXT.test(url.pathname) || url.pathname.startsWith('/cdn-cgi/')) return 'asset';
  if (FEED_HINT.test(url.pathname)) return 'feed';
  if (template) {
    const kind = template.classify(url);
    if (kind) return kind;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  for (const param of SEARCH_PARAMS) if (url.searchParams.has(param) && url.searchParams.get(param)) return 'search';
  if (segments.length === 0) return 'home';
  if (/^(?:search|find)$/i.test(segments[0] ?? '')) return 'search';
  if (segments.length === 1 && STATIC_SLUGS.has((segments[0] ?? '').toLowerCase())) return 'static';
  if (/^(?:tag|tags|category|categories|genre|genres|label|author|topic|topics)$/i.test(segments[0] ?? '')) return 'taxonomy';
  if (segments.some((segment) => /^page$/i.test(segment)) || url.searchParams.has('page') || url.searchParams.has('paged')) return 'listing';
  if (segments.length === 1) return 'detail';
  return 'other';
}

export function groupUrls(urls: string[], template?: SiteTemplate | null, maxExamples = 3): UrlGroup[] {
  const groups = new Map<string, UrlGroup>();
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const key = patternKey(url);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.examples.length < maxExamples) existing.examples.push(raw);
    } else {
      groups.set(key, { pattern: key, kind: classifyUrl(url, template), count: 1, examples: [raw] });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern));
}
