import type { EpisodeItem, PageKind, PatternSpec, SiteTemplate, TemplateContext } from '../types';
import { clean, textOf } from '../utils/dom';

export abstract class BaseTemplate implements Partial<SiteTemplate> {
  abstract id: string;
  abstract name: string;
  abstract vendor: string;
  abstract family: SiteTemplate['family'];
  abstract contentType: SiteTemplate['contentType'];

  protected segments(url: URL): string[] {
    return url.pathname.split('/').filter(Boolean).map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  }

  protected spec(kind: PageKind, pattern: string, description: string, example: string | null = null): PatternSpec {
    return { kind, pattern, description, example };
  }

  protected score(...parts: Array<[boolean, number]>): number {
    const total = parts.reduce((sum, [hit, weight]) => (hit ? sum + weight : sum), 0);
    return Math.min(1, Number(total.toFixed(2)));
  }

  protected has(ctx: TemplateContext, selector: string): boolean {
    try {
      return ctx.doc.querySelector(selector) !== null;
    } catch {
      return false;
    }
  }
}

export function pairsFromSpans(container: ParentNode, selector: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const span of Array.from(container.querySelectorAll(selector))) {
    const label = span.querySelector('b');
    if (!label) continue;
    const key = textOf(label).replace(/:\s*$/, '').trim();
    if (!key) continue;
    const full = clean(span.textContent);
    const value = clean(full.slice(full.indexOf(textOf(label)) + textOf(label).length).replace(/^:\s*/, ''));
    if (value && !(key in result)) result[key] = value;
  }
  return result;
}

export function parseNumber(text: string): string {
  const match = /(\d+(?:[.,]\d+)?)/.exec(text);
  return match ? (match[1] as string).replace(',', '.') : text.trim();
}

export function sortEpisodes(items: EpisodeItem[]): EpisodeItem[] {
  return [...items].sort((a, b) => {
    const na = Number.parseFloat(a.number);
    const nb = Number.parseFloat(b.number);
    if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
    return na - nb;
  });
}

export function queryString(params: Record<string, string | string[]> | undefined): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.append(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
