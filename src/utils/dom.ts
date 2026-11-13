import { JSDOM, VirtualConsole } from 'jsdom';
import { normalizeUrl } from './normalize-url';

export function parseHtml(html: string, url = 'about:blank'): Document {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, { url, virtualConsole, contentType: 'text/html' });
  return dom.window.document;
}

export function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function textOf(el: Element | null | undefined): string {
  return clean(el?.textContent);
}

export function firstAttr(el: Element | null | undefined, names: string[]): string | null {
  if (!el) return null;
  for (const name of names) {
    const value = el.getAttribute(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

export function absUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  const value = href.trim();
  if (!value || value === '#' || /^(javascript|mailto|tel|data|blob|about):/i.test(value)) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveAny(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  const value = href.trim();
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

export function imageUrl(img: Element | null | undefined, base: string): string | null {
  if (!img) return null;
  const direct = firstAttr(img, ['data-src', 'data-lazy-src', 'data-original', 'data-lazyload', 'data-cfsrc', 'src']);
  if (direct && !direct.startsWith('data:')) return absUrl(direct, base);
  const srcset = firstAttr(img, ['data-srcset', 'srcset']);
  if (srcset) {
    const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
    if (first) return absUrl(first, base);
  }
  return null;
}

export function nodesOf<T extends Element = Element>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    result.push(item);
  }
  return result;
}

export function internalHref(href: string | null | undefined, base: string): string | null {
  const abs = absUrl(href, base);
  return abs ? normalizeUrl(abs) : null;
}

export function decodeBase64(value: string): string | null {
  const cleaned = value.trim().replace(/\s+/g, '');
  if (cleaned.length < 8 || cleaned.length % 4 === 1 || !/^[A-Za-z0-9+_\-/]+={0,2}$/.test(cleaned)) return null;
  try {
    const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    if (!decoded || /[\u0000-\u0008\u000e-\u001f]/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}
