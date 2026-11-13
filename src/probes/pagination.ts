import type { PaginationInfo, SiteTemplate } from '../types';
import type { Session } from '../core/session';
import { absUrl, parseHtml } from '../utils/dom';
import { toMessage } from '../utils/errors';

const QUERY_PARAMS = ['page', 'paged', 'p', 'pg', 'pagenum', 'pageno', 'pagenumber'];
export const PAGINATION_CONTAINERS = '.pagination, .page-numbers, .nav-links, .wp-pagenavi, .hpage, nav[aria-label*="pagination" i], ul.pager, .paginator, [class*="paginat"]';

interface Scheme {
  scheme: 'path' | 'query';
  pattern: string;
  number: number;
}

export function detectPageScheme(href: string): Scheme | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const pathMatch = /^(.*)\/page\/(\d+)\/?$/.exec(url.pathname);
  if (pathMatch) {
    return { scheme: 'path', number: Number(pathMatch[2]), pattern: `${url.origin}${pathMatch[1]}/page/{n}/${url.search}` };
  }
  for (const key of QUERY_PARAMS) {
    const value = url.searchParams.get(key);
    if (value !== null && /^\d+$/.test(value)) {
      const copy = new URL(url.toString());
      copy.searchParams.set(key, '__N__');
      return { scheme: 'query', number: Number(value), pattern: copy.toString().replace('__N__', '{n}') };
    }
  }
  return null;
}

export function buildPageUrl(pattern: string, page: number): string {
  return pattern.replace('{n}', String(page));
}

export function extractPagination(doc: Document, base: string): Omit<PaginationInfo, 'verified' | 'notes'> {
  const anchors = new Map<string, { text: string; el: Element }>();
  for (const container of Array.from(doc.querySelectorAll(PAGINATION_CONTAINERS))) {
    for (const el of Array.from(container.querySelectorAll('a[href]'))) {
      const url = absUrl(el.getAttribute('href'), base);
      if (url) anchors.set(url, { text: (el.textContent ?? '').trim(), el });
    }
  }
  for (const el of Array.from(doc.querySelectorAll('a[rel~="next"], a[rel~="prev"], link[rel="next"], link[rel="prev"]'))) {
    const url = absUrl(el.getAttribute('href'), base);
    if (url && !anchors.has(url)) anchors.set(url, { text: el.getAttribute('rel') ?? '', el });
  }
  let current: number | null = null;
  const currentEl = doc.querySelector('.page-numbers.current, .pagination .current, .pagination .active, .wp-pagenavi .current, [aria-current="page"]');
  const currentText = (currentEl?.textContent ?? '').trim();
  if (/^\d+$/.test(currentText)) current = Number(currentText);

  let next: string | null = null;
  let prev: string | null = null;
  let scheme: Scheme | null = null;
  let last = 0;
  for (const [url, info] of anchors) {
    const rel = info.el.getAttribute('rel') ?? '';
    const cls = info.el.className ?? '';
    const text = info.text.toLowerCase();
    if (!next && (/\bnext\b/.test(rel) || /\bnext\b/.test(String(cls)) || /^(next|older|selanjutnya|berikutnya|»|›|>)/.test(text) || text.includes('next'))) next = url;
    if (!prev && (/\bprev\b/.test(rel) || /\bprev(ious)?\b/.test(String(cls)) || /^(prev|previous|newer|sebelumnya|«|‹|<)/.test(text))) prev = url;
    const detected = detectPageScheme(url);
    if (detected) {
      scheme ??= detected;
      if (detected.number > last) last = detected.number;
    }
    if (/^\d+$/.test(info.text) && Number(info.text) > last) last = Number(info.text);
  }
  if (!scheme && next) scheme = detectPageScheme(next);
  if (current === null) {
    const own = detectPageScheme(base);
    current = own ? own.number : anchors.size > 0 ? 1 : null;
  }
  const detected = anchors.size > 0 || next !== null;
  return {
    detected,
    scheme: scheme ? scheme.scheme : 'none',
    pattern: scheme?.pattern ?? null,
    current,
    last: last > 0 ? last : null,
    next,
    prev,
  };
}

export async function probePagination(session: Session, template: SiteTemplate, listUrl: string): Promise<PaginationInfo> {
  const notes: string[] = [];
  let html: string;
  let finalUrl: string;
  try {
    const result = await session.fetch(listUrl);
    if (result.status >= 400) {
      return { detected: false, scheme: 'none', pattern: null, current: null, last: null, next: null, prev: null, verified: false, notes: [`Listing page returned HTTP ${result.status}.`] };
    }
    html = result.body;
    finalUrl = result.finalUrl;
  } catch (error) {
    return { detected: false, scheme: 'none', pattern: null, current: null, last: null, next: null, prev: null, verified: false, notes: [`Could not fetch listing page: ${toMessage(error)}`] };
  }
  const doc = parseHtml(html, finalUrl);
  const info = extractPagination(doc, finalUrl);
  let pattern = info.pattern;
  if (!pattern) {
    const base = new URL(finalUrl);
    const candidate = template.listUrl(base, 2);
    const scheme = detectPageScheme(candidate);
    if (scheme) {
      pattern = scheme.pattern;
      notes.push('Pagination pattern inferred from the template; no pagination links were found in the markup.');
    }
  }
  if (!pattern) return { ...info, notes: [...notes, 'No pagination scheme detected.'], verified: false };

  const firstItems = template.extractListing(doc, finalUrl).map((item) => item.url);
  let verified = false;
  try {
    const second = await session.document(buildPageUrl(pattern, 2), { referer: finalUrl });
    if (second.result.status < 400) {
      const secondItems = template.extractListing(second.doc, second.result.finalUrl).map((item) => item.url);
      const overlap = secondItems.filter((url) => firstItems.includes(url)).length;
      verified = secondItems.length > 0 && overlap < secondItems.length;
      notes.push(verified ? `Page 2 returned ${secondItems.length} items, ${overlap} overlapping with page 1.` : 'Page 2 returned no new items.');
    } else {
      notes.push(`Page 2 returned HTTP ${second.result.status}.`);
    }
  } catch (error) {
    notes.push(`Page 2 verification failed: ${toMessage(error)}`);
  }
  return { ...info, detected: true, pattern, verified, notes };
}
