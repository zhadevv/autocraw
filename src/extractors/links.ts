import type { LinkInfo } from '../types';
import { absUrl, clean } from '../utils/dom';
import { normalizeUrl, sameSite } from '../utils/normalize-url';

export function extractLinks(doc: Document, base: string): LinkInfo[] {
  const seen = new Set<string>();
  const links: LinkInfo[] = [];
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const abs = absUrl(anchor.getAttribute('href'), base);
    if (!abs) continue;
    const normalized = normalizeUrl(abs) ?? abs;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const text = clean(anchor.textContent) || clean(anchor.getAttribute('title')) || clean(anchor.querySelector('img')?.getAttribute('alt'));
    links.push({
      url: normalized,
      text: text.slice(0, 200),
      rel: anchor.getAttribute('rel') ?? '',
      internal: sameSite(normalized, base),
    });
  }
  return links;
}
