import type { DetailInfo, EpisodeItem, ListingItem, PageKind, PatternSpec, ReadInfo, SiteTemplate, TemplateContext, WatchInfo } from '../../types';
import { absUrl, clean, firstAttr, imageUrl, textOf, uniqueBy } from '../../utils/dom';
import { detectMedia, decodeMirrorValue } from '../../media/detector';
import { BaseTemplate, pairsFromSpans, parseNumber, queryString } from '../base';

const TAXONOMIES = new Set(['genres', 'season', 'studio', 'director', 'cast', 'network', 'country', 'label']);
const EPISODE_SLUG = /(?:^|-)(?:episode|eps?|ova|special|movie)-?\d*/i;
const EPISODE_NUMBER_SLUG = /-(?:episode|eps?)-\d+/i;

export class AnimeStreamTemplate extends BaseTemplate implements SiteTemplate {
  id = 'wordpress-animestream';
  name = 'AnimeStream';
  vendor = 'Themesia';
  family = 'wordpress' as const;
  contentType = 'anime' as const;

  detect(ctx: TemplateContext): number {
    const html = ctx.html;
    return this.score(
      [/\/wp-content\/themes\/animestream/i.test(html), 0.6],
      [this.has(ctx, '.listupd article.bs, .listupd .bsx'), 0.2],
      [this.has(ctx, '.bixbox'), 0.08],
      [this.has(ctx, '.postbody'), 0.06],
      [this.has(ctx, '.megavid, .eplister, .animefull'), 0.2],
      [this.has(ctx, '.releases'), 0.05],
      [this.has(ctx, 'a[href*="/anime/"]'), 0.1],
      [/class="[^"]*\b(?:bsx|epx|typez)\b/.test(html), 0.1],
      [this.has(ctx, 'select.mirror, .mobius'), 0.1],
    );
  }

  classify(url: URL): PageKind | null {
    const segments = this.segments(url);
    if (segments.length === 0) return url.searchParams.get('s') ? 'search' : 'home';
    if (url.searchParams.get('s')) return 'search';
    const first = (segments[0] ?? '').toLowerCase();
    if (first === 'anime') {
      if (segments.length === 1) return 'listing';
      if (segments[1] === 'page') return 'listing';
      if (segments[1] === 'list-mode') return 'listing';
      return 'detail';
    }
    if (TAXONOMIES.has(first)) return segments.length > 1 && segments[1] !== 'page' ? 'taxonomy' : 'listing';
    if (first === 'page') return 'listing';
    if (['schedule', 'bookmark', 'az-lists', 'anime-list'].includes(first)) return first === 'az-lists' || first === 'anime-list' ? 'listing' : 'static';
    if (segments.length === 1 && (EPISODE_NUMBER_SLUG.test(first) || EPISODE_SLUG.test(first))) return 'watch';
    if (segments.length === 2 && segments[1] === 'v') return 'watch';
    if (segments.length === 3 && segments[1] === 'v') return 'watch';
    return null;
  }

  patterns(base: URL): PatternSpec[] {
    const o = base.origin;
    return [
      this.spec('home', '/', 'Home: hot updates, latest releases, popular sidebar', o + '/'),
      this.spec('listing', '/anime/', 'Series archive with quick filter form', `${o}/anime/`),
      this.spec('listing', '/anime/?genre[]={slug}&status={status}&type={type}&order={order}', 'Filtered archive (checkbox arrays for taxonomies)', `${o}/anime/?status=&type=&order=update`),
      this.spec('listing', '/anime/page/{n}/', 'Paginated archive via WordPress paginate_links', `${o}/anime/page/2/`),
      this.spec('detail', '/anime/{slug}/', 'Series page (custom post type "anime") with .eplister episode list', null),
      this.spec('watch', '/{slug}-episode-{n}-.../', 'Episode page: regular WordPress post at the site root, player in .megavid', null),
      this.spec('watch', '/{episode-slug}/v/{n}/', 'Mirror endpoint "v" registered by the theme via add_rewrite_endpoint', null),
      this.spec('search', '/?s={query}', 'WordPress search; live search uses admin-ajax', `${o}/?s=naruto`),
      this.spec('taxonomy', '/genres/{slug}/', 'Genre archive', `${o}/genres/action/`),
      this.spec('taxonomy', '/season/{slug}/', 'Season archive', null),
      this.spec('taxonomy', '/studio/{slug}/', 'Studio archive', null),
      this.spec('taxonomy', '/network/{slug}/', 'Network archive', null),
      this.spec('taxonomy', '/director/{slug}/', 'Director archive', null),
      this.spec('taxonomy', '/cast/{slug}/', 'Cast archive', null),
      this.spec('taxonomy', '/country/{slug}/', 'Country archive', null),
      this.spec('listing', '/anime/list-mode/', 'Plain text list mode (slug follows the anime post type slug)', `${o}/anime/list-mode/`),
      this.spec('static', '/schedule/', 'Release schedule page template', `${o}/schedule/`),
      this.spec('static', '/bookmark/', 'Bookmark page template (client side)', `${o}/bookmark/`),
    ];
  }

  extractListing(doc: Document, base: string): ListingItem[] {
    const items: ListingItem[] = [];
    for (const card of Array.from(doc.querySelectorAll('article.bs'))) {
      const anchor = card.querySelector('a.tip, .bsx a[href], a[href]');
      const url = absUrl(anchor?.getAttribute('href'), base);
      if (!url) continue;
      const title = textOf(card.querySelector('.tt h2')) || clean(anchor?.getAttribute('title')) || textOf(card.querySelector('.tt'));
      const status = textOf(card.querySelector('.bt .epx, .epx')) || null;
      items.push({
        id: anchor?.getAttribute('rel') || null,
        title,
        url,
        image: imageUrl(card.querySelector('.limit img, img'), base),
        type: textOf(card.querySelector('.typez')) || null,
        status,
        badge: textOf(card.querySelector('.sb')) || (card.querySelector('.hotbadge') ? 'HOT' : null),
        latest: status,
        rating: textOf(card.querySelector('.numscore')) || null,
        hot: card.querySelector('.hotbadge') !== null,
      });
    }
    for (const row of Array.from(doc.querySelectorAll('.serieslist li'))) {
      const anchor = row.querySelector('h4 a, h2 a, a.series, a[href]');
      const url = absUrl(anchor?.getAttribute('href'), base);
      if (!url) continue;
      items.push({
        id: null,
        title: textOf(anchor),
        url,
        image: imageUrl(row.querySelector('img'), base),
        type: null,
        status: null,
        badge: null,
        latest: null,
        rating: textOf(row.querySelector('.numscore, .rating')) || null,
        hot: false,
      });
    }
    return uniqueBy(items, (item) => item.url).filter((item) => item.title);
  }

  extractChapters(doc: Document, base: string): EpisodeItem[] {
    const result: EpisodeItem[] = [];
    for (const li of Array.from(doc.querySelectorAll('.eplister ul li'))) {
      const anchor = li.querySelector('a[href]');
      const url = absUrl(anchor?.getAttribute('href'), base);
      if (!url) continue;
      const indexAttr = li.getAttribute('data-index');
      result.push({
        number: parseNumber(textOf(li.querySelector('.epl-num'))),
        title: textOf(li.querySelector('.epl-title')),
        url,
        date: textOf(li.querySelector('.epl-date')) || null,
        sub: textOf(li.querySelector('.epl-sub .status, .epl-sub')) || null,
        index: indexAttr !== null && /^\d+$/.test(indexAttr) ? Number(indexAttr) : null,
      });
    }
    return result;
  }

  extractDetail(doc: Document, base: string): DetailInfo | null {
    const root = doc.querySelector('.animefull, .bigcontent, .single-info');
    const heading = doc.querySelector('.infox h1.entry-title, h1.entry-title');
    if (!root || !heading) return null;
    const ratingText = textOf(doc.querySelector('.rating strong'));
    const ratingMeta = doc.querySelector('[itemprop="ratingValue"]')?.getAttribute('content') ?? null;
    const chapters = this.extractChapters(doc, base);
    const firstAnchor = doc.querySelector('.epcurfirst')?.closest('a');
    const lastAnchor = doc.querySelector('.epcurlast')?.closest('a');
    return {
      title: textOf(heading),
      alternative: textOf(doc.querySelector('.infox .alter')) || null,
      cover: imageUrl(doc.querySelector('.thumbook .thumb img, .thumb img'), base),
      rating: ratingMeta ?? (ratingText ? parseNumber(ratingText) : null),
      synopsis: textOf(doc.querySelector('.synp .entry-content, .entry-content[itemprop="description"]')) || null,
      genres: Array.from(doc.querySelectorAll('.genxed a')).flatMap((a) => {
        const url = absUrl(a.getAttribute('href'), base);
        return url ? [{ name: textOf(a), url }] : [];
      }),
      tags: Array.from(doc.querySelectorAll('.bottom.tags a')).map((a) => textOf(a)).filter(Boolean),
      attributes: pairsFromSpans(doc, '.infox .spe span'),
      trailer: absUrl(doc.querySelector('a.trailerbutton')?.getAttribute('href'), base),
      chapters,
      firstChapter: absUrl(firstAnchor?.getAttribute('href'), base) ?? chapters[chapters.length - 1]?.url ?? null,
      lastChapter: absUrl(lastAnchor?.getAttribute('href'), base) ?? chapters[0]?.url ?? null,
      ajaxChapters: null,
    };
  }

  extractWatch(doc: Document, base: string): WatchInfo | null {
    const root = doc.querySelector('.megavid, .video-content');
    if (!root) return null;
    const title = textOf(doc.querySelector('.megavid h1.entry-title, h1.entry-title'));
    const seriesAnchor = Array.from(doc.querySelectorAll('.megavid .year a, .megavid .lm a, .infox a')).find((a) => /\/anime\//.test(a.getAttribute('href') ?? ''));
    const mirrors: WatchInfo['mirrors'] = [];
    for (const option of Array.from(doc.querySelectorAll('select.mirror option, .mobius select option'))) {
      const value = option.getAttribute('value') ?? '';
      if (!value) continue;
      const decoded = decodeMirrorValue(value);
      const url = decoded.url ? absUrl(decoded.url.startsWith('//') ? `https:${decoded.url}` : decoded.url, base) : null;
      if (!url) continue;
      mirrors.push({ label: textOf(option) || `Mirror ${mirrors.length + 1}`, url, encoded: decoded.encoded });
    }
    const playerFrame = doc.querySelector('.video-content iframe, [id="embed_holder"] iframe, .player-embed iframe');
    const defaultPlayer = absUrl(firstAttr(playerFrame, ['src', 'data-src', 'data-lazy-src']), base);
    const downloads: WatchInfo['downloads'] = [];
    for (const a of Array.from(doc.querySelectorAll('.iconx a[href], .soraddlx a[href], .mctnx a[href], .dlbox a[href]'))) {
      const url = absUrl(a.getAttribute('href'), base);
      if (url) downloads.push({ label: textOf(a) || 'Download', url });
    }
    const nav = Array.from(doc.querySelectorAll('.naveps .nvs'));
    const centerIndex = nav.findIndex((node) => node.classList.contains('nvsc'));
    const linkOf = (node: Element | undefined): string | null => absUrl(node?.querySelector('a[href]')?.getAttribute('href'), base);
    const prevNode = centerIndex > 0 ? nav[centerIndex - 1] : nav.length === 2 ? nav[0] : undefined;
    const nextNode = centerIndex >= 0 && centerIndex < nav.length - 1 ? nav[centerIndex + 1] : nav.length === 2 ? nav[1] : undefined;
    const playlist: EpisodeItem[] = [];
    for (const li of Array.from(doc.querySelectorAll('.episodelist ul li'))) {
      const url = absUrl(li.querySelector('a[href]')?.getAttribute('href'), base);
      if (!url) continue;
      playlist.push({
        number: parseNumber(textOf(li.querySelector('.playinfo h3, h3'))),
        title: textOf(li.querySelector('.playinfo h3, h3')),
        url,
        date: textOf(li.querySelector('.playinfo span')) || null,
        sub: null,
        index: null,
      });
    }
    return {
      title,
      seriesUrl: absUrl(seriesAnchor?.getAttribute('href'), base),
      prev: linkOf(prevNode),
      next: linkOf(nextNode),
      mirrors,
      defaultPlayer,
      downloads: uniqueBy(downloads, (d) => d.url),
      playlist,
      media: detectMedia(doc.documentElement.outerHTML, base, doc),
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
    const path = page > 1 ? `/anime/page/${page}/` : '/anime/';
    return `${base.origin}${path}${queryString(params)}`;
  }
}
