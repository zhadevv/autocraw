import type { DetailInfo, EpisodeItem, ListingItem, PageKind, PatternSpec, ReadInfo, SiteTemplate, TemplateContext, WatchInfo } from '../types';
import { absUrl, clean, imageUrl, textOf, uniqueBy } from '../utils/dom';
import { sameSite } from '../utils/normalize-url';
import { detectMedia } from '../media/detector';
import { classifyUrl } from '../classify/taxonomy';
import { BaseTemplate, queryString } from './base';

export class GenericTemplate extends BaseTemplate implements SiteTemplate {
  id = 'generic';
  name = 'Generic';
  vendor = 'autocraw';
  family = 'generic' as const;
  contentType = 'generic' as const;

  detect(_ctx: TemplateContext): number {
    return 0.1;
  }

  classify(url: URL): PageKind | null {
    return classifyUrl(url, null);
  }

  patterns(base: URL): PatternSpec[] {
    return [this.spec('home', '/', 'Home page', base.origin + '/'), this.spec('search', '/?s={query}', 'Common WordPress style search (unverified)', `${base.origin}/?s=test`)];
  }

  extractListing(doc: Document, base: string): ListingItem[] {
    const items: ListingItem[] = [];
    for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
      if (anchor.closest('nav, header, footer, aside, [role="navigation"]')) continue;
      const img = anchor.querySelector('img');
      if (!img) continue;
      const url = absUrl(anchor.getAttribute('href'), base);
      if (!url || !sameSite(url, base)) continue;
      const title = clean(anchor.getAttribute('title')) || clean(img.getAttribute('alt')) || textOf(anchor);
      if (!title) continue;
      items.push({ id: null, title, url, image: imageUrl(img, base), type: null, status: null, badge: null, latest: null, rating: null, hot: false });
    }
    return uniqueBy(items, (item) => item.url);
  }

  extractDetail(doc: Document, base: string): DetailInfo | null {
    const heading = doc.querySelector('h1');
    if (!heading) return null;
    return {
      title: textOf(heading),
      alternative: null,
      cover: absUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute('content'), base),
      rating: null,
      synopsis: clean(doc.querySelector('meta[name="description" i]')?.getAttribute('content')) || null,
      genres: [],
      tags: [],
      attributes: {},
      trailer: null,
      chapters: [],
      firstChapter: null,
      lastChapter: null,
      ajaxChapters: null,
    };
  }

  extractChapters(_doc: Document, _base: string): EpisodeItem[] {
    return [];
  }

  extractWatch(doc: Document, base: string): WatchInfo | null {
    const media = detectMedia(doc.documentElement.outerHTML, base, doc);
    if (media.sources.length === 0) return null;
    return {
      title: textOf(doc.querySelector('h1')),
      seriesUrl: null,
      prev: null,
      next: null,
      mirrors: media.sources.filter((s) => s.kind === 'iframe').map((s, index) => ({ label: s.label ?? `Source ${index + 1}`, url: s.url, encoded: s.encoded })),
      defaultPlayer: media.sources.find((s) => s.kind === 'iframe')?.url ?? null,
      downloads: [],
      playlist: [],
      media,
    };
  }

  extractRead(_doc: Document, _base: string): ReadInfo | null {
    return null;
  }

  searchUrl(base: URL, query: string, page = 1): string {
    const q = `?s=${encodeURIComponent(query)}`;
    return page > 1 ? `${base.origin}/page/${page}/${q}` : `${base.origin}/${q}`;
  }

  listUrl(base: URL, page: number, params?: Record<string, string | string[]>): string {
    return `${base.origin}${page > 1 ? `/page/${page}/` : '/'}${queryString(params)}`;
  }
}
