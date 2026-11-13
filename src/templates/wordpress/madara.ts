import type { DetailInfo, EpisodeItem, ListingItem, PageKind, PatternSpec, ReadInfo, SiteTemplate, TemplateContext, WatchInfo } from '../../types';
import { absUrl, clean, firstAttr, imageUrl, textOf, uniqueBy } from '../../utils/dom';
import { BaseTemplate, parseNumber, queryString } from '../base';

const TAXONOMIES = new Set(['manga-genre', 'manga-tag', 'manga-author', 'manga-artist', 'manga-release', 'manga-status', 'manga-type']);

function contentItems(root: ParentNode): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of Array.from(root.querySelectorAll('.post-content_item'))) {
    const key = textOf(item.querySelector('.summary-heading h5, .summary-heading')).replace(/:\s*$/, '');
    const content = item.querySelector('.summary-content');
    if (!key || !content) continue;
    const value = clean(content.textContent);
    if (value && !(key in result)) result[key] = value;
  }
  return result;
}

export class MadaraTemplate extends BaseTemplate implements SiteTemplate {
  id = 'wordpress-madara';
  name = 'Madara';
  vendor = 'MangaBooth';
  family = 'wordpress' as const;
  contentType = 'manga' as const;

  detect(ctx: TemplateContext): number {
    const html = ctx.html;
    return this.score(
      [/\/wp-content\/themes\/madara/i.test(html), 0.5],
      [/\/wp-content\/plugins\/wp-manga/i.test(html), 0.5],
      [this.has(ctx, 'body.madara, body[class*="madara"]'), 0.15],
      [this.has(ctx, '.page-item-detail, .c-tabs-item__content'), 0.25],
      [this.has(ctx, '.wp-manga-chapter, .version-chap, [id="manga-chapters-holder"]'), 0.25],
      [this.has(ctx, '.reading-content'), 0.2],
      [this.has(ctx, '.manga-title-badges, .summary_image, .profile-manga'), 0.15],
      [/wp-manga|madara_load_more|manga_get_chapters/i.test(html), 0.15],
    );
  }

  classify(url: URL): PageKind | null {
    const segments = this.segments(url);
    if (url.searchParams.get('s') && (url.searchParams.get('post_type') === 'wp-manga' || segments.length === 0)) return 'search';
    if (segments.length === 0) return url.searchParams.has('m_orderby') ? 'listing' : 'home';
    const first = (segments[0] ?? '').toLowerCase();
    if (first === 'manga') {
      if (segments.length === 1 || segments[1] === 'page') return 'listing';
      if (segments.length === 2) return 'detail';
      if (segments[2] === 'ajax') return 'feed';
      if (segments[2] === 'amp' || /^comment-/.test(segments[2] ?? '')) return 'detail';
      return 'read';
    }
    if (TAXONOMIES.has(first)) return segments.length > 1 && segments[1] !== 'page' ? 'taxonomy' : 'listing';
    if (first === 'page') return 'listing';
    return null;
  }

  patterns(base: URL): PatternSpec[] {
    const o = base.origin;
    return [
      this.spec('home', '/', 'Home: popular slider, latest updates grid', o + '/'),
      this.spec('listing', '/manga/', 'Series archive (post type wp-manga, slug configurable in WP-Manga settings)', `${o}/manga/`),
      this.spec('listing', '/manga/?m_orderby={latest|alphabet|rating|trending|views|new-manga}', 'Archive ordering', `${o}/manga/?m_orderby=latest`),
      this.spec('listing', '/manga/page/{n}/', 'Paginated archive', `${o}/manga/page/2/`),
      this.spec('detail', '/manga/{slug}/', 'Series page with chapter list (.wp-manga-chapter)', null),
      this.spec('read', '/manga/{slug}/{chapter-slug}/', 'Reader page; images in .reading-content', null),
      this.spec('read', '/manga/{slug}/{volume-slug}/{chapter-slug}/', 'Reader page for series that use volumes', null),
      this.spec('read', '/manga/{slug}/{chapter-slug}/p/{page}/', 'Paged reader layout', null),
      this.spec('read', '/manga/{slug}/chapter-{n}/?style={list|paged}', 'Reader layout switch', null),
      this.spec('feed', '/manga/{slug}/ajax/chapters/?t={page}', 'POST (no body) returns the chapter list HTML injected into #manga-chapters-holder', null),
      this.spec('search', '/?s={query}&post_type=wp-manga', 'Search restricted to manga', `${o}/?s=one&post_type=wp-manga`),
      this.spec('search', '/?s=&post_type=wp-manga&genre[]={slug}&op=&author=&artist=&release=&adult=&status[]=', 'Advanced search form', null),
      this.spec('taxonomy', '/manga-genre/{slug}/', 'Genre archive (default slug, configurable in WP-Manga settings)', `${o}/manga-genre/action/`),
      this.spec('taxonomy', '/manga-tag/{slug}/', 'Tag archive', null),
      this.spec('taxonomy', '/manga-author/{slug}/', 'Author archive', null),
      this.spec('taxonomy', '/manga-artist/{slug}/', 'Artist archive', null),
      this.spec('taxonomy', '/manga-release/{year}/', 'Release year archive', null),
      this.spec('feed', '/wp-admin/admin-ajax.php (action=madara_load_more)', 'POST load-more endpoint for archives and home sections', `${o}/wp-admin/admin-ajax.php`),
    ];
  }

  extractListing(doc: Document, base: string): ListingItem[] {
    const items: ListingItem[] = [];
    for (const card of Array.from(doc.querySelectorAll('.page-item-detail'))) {
      const anchor = card.querySelector('.post-title a, .item-thumb a[href]');
      const url = absUrl(anchor?.getAttribute('href'), base);
      if (!url) continue;
      const badge = card.querySelector('.manga-title-badges');
      items.push({
        id: card.querySelector('[data-post-id]')?.getAttribute('data-post-id') ?? null,
        title: textOf(card.querySelector('.post-title a')) || clean(card.querySelector('.item-thumb a')?.getAttribute('title')),
        url,
        image: imageUrl(card.querySelector('.item-thumb img, img'), base),
        type: null,
        status: null,
        badge: badge ? textOf(badge) : null,
        latest: textOf(card.querySelector('.chapter-item .chapter a, .list-chapter .chapter a')) || null,
        rating: textOf(card.querySelector('.score, .post-total-rating .score')) || null,
        hot: badge?.classList.contains('hot') ?? false,
      });
    }
    for (const card of Array.from(doc.querySelectorAll('.c-tabs-item__content'))) {
      const anchor = card.querySelector('.post-title a, .tab-thumb a[href]');
      const url = absUrl(anchor?.getAttribute('href'), base);
      if (!url) continue;
      const attrs = contentItems(card);
      items.push({
        id: null,
        title: textOf(card.querySelector('.post-title a')) || clean(card.querySelector('.tab-thumb a')?.getAttribute('title')),
        url,
        image: imageUrl(card.querySelector('.tab-thumb img, img'), base),
        type: null,
        status: attrs.Status ?? null,
        badge: null,
        latest: textOf(card.querySelector('.latest-chap .chapter a')) || null,
        rating: textOf(card.querySelector('.score')) || null,
        hot: false,
      });
    }
    return uniqueBy(items, (item) => item.url).filter((item) => item.title);
  }

  extractChapters(doc: Document, base: string): EpisodeItem[] {
    const result: EpisodeItem[] = [];
    for (const [index, li] of Array.from(doc.querySelectorAll('li.wp-manga-chapter')).entries()) {
      const anchor = li.querySelector('a[href]');
      const url = absUrl(anchor?.getAttribute('href'), base);
      if (!url) continue;
      const title = textOf(anchor);
      const date = textOf(li.querySelector('.chapter-release-date i, .chapter-release-date')) || clean(li.querySelector('.chapter-release-date a')?.getAttribute('title')) || null;
      result.push({ number: parseNumber(title), title, url, date, sub: null, index });
    }
    return result;
  }

  extractDetail(doc: Document, base: string): DetailInfo | null {
    const heading = doc.querySelector('.post-title h1, .post-title h3, h1');
    const hasProfile = doc.querySelector('.profile-manga, .summary_image, .post-content_item');
    if (!heading || !hasProfile) return null;
    const clone = heading.cloneNode(true) as Element;
    clone.querySelectorAll('.manga-title-badges, span').forEach((node) => node.remove());
    const attributes = contentItems(doc);
    const chapters = this.extractChapters(doc, base);
    const holder = doc.querySelector('[id="manga-chapters-holder"]');
    const normalizedBase = base.split('#')[0]?.split('?')[0] ?? base;
    const ajaxBase = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;
    const ratingEl = doc.querySelector('.post-total-rating .score, [id="averagerating"], .score');
    return {
      title: clean(clone.textContent) || textOf(heading),
      alternative: attributes.Alternative ?? attributes['Alternative(s)'] ?? attributes['Alt Name'] ?? null,
      cover: imageUrl(doc.querySelector('.summary_image img'), base),
      rating: ratingEl ? textOf(ratingEl) : null,
      synopsis: textOf(doc.querySelector('.description-summary .summary__content, .summary__content, .manga-excerpt')) || null,
      genres: Array.from(doc.querySelectorAll('.genres-content a')).flatMap((a) => {
        const url = absUrl(a.getAttribute('href'), base);
        return url ? [{ name: textOf(a), url }] : [];
      }),
      tags: Array.from(doc.querySelectorAll('.tags-content a')).map((a) => textOf(a)).filter(Boolean),
      attributes,
      trailer: null,
      chapters,
      firstChapter: chapters[chapters.length - 1]?.url ?? null,
      lastChapter: chapters[0]?.url ?? null,
      ajaxChapters: chapters.length === 0 && holder ? { endpoint: `${ajaxBase}ajax/chapters/?t=1`, method: 'POST' } : null,
    };
  }

  extractWatch(_doc: Document, _base: string): WatchInfo | null {
    return null;
  }

  extractRead(doc: Document, base: string): ReadInfo | null {
    const container = doc.querySelector('.reading-content');
    if (!container) return null;
    const pages: string[] = [];
    for (const img of Array.from(container.querySelectorAll('img'))) {
      const url = imageUrl(img, base);
      if (url) pages.push(url);
    }
    const options: ReadInfo['chapterOptions'] = [];
    for (const option of Array.from(doc.querySelectorAll('select.single-chapter-select option'))) {
      const raw = firstAttr(option, ['data-redirect', 'value']);
      const url = absUrl(raw, base);
      if (url) options.push({ label: textOf(option), url });
    }
    const crumbs = Array.from(doc.querySelectorAll('.breadcrumb li a, .c-breadcrumb a')).map((a) => absUrl(a.getAttribute('href'), base)).filter((u): u is string => Boolean(u));
    const seriesUrl = [...crumbs].reverse().find((u) => /\/manga\/[^/]+\/?$/.test(new URL(u).pathname)) ?? null;
    return {
      title: textOf(doc.querySelector('[id="chapter-heading"], h1')),
      seriesUrl,
      prev: absUrl(doc.querySelector('.nav-previous a, a.prev_page')?.getAttribute('href'), base),
      next: absUrl(doc.querySelector('.nav-next a, a.next_page')?.getAttribute('href'), base),
      pages: uniqueBy(pages, (url) => url),
      chapterOptions: options,
    };
  }

  searchUrl(base: URL, query: string, page = 1): string {
    const q = `?s=${encodeURIComponent(query)}&post_type=wp-manga`;
    return page > 1 ? `${base.origin}/page/${page}/${q}` : `${base.origin}/${q}`;
  }

  listUrl(base: URL, page: number, params?: Record<string, string | string[]>): string {
    const path = page > 1 ? `/manga/page/${page}/` : '/manga/';
    return `${base.origin}${path}${queryString(params)}`;
  }
}
