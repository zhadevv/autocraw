import type { AutocrawConfigInput, FetchResult, MediaReport, SiteReport, UrlGroup } from '../types';
import { Session } from './session';
import { Crawler } from './crawler';
import { analyzeHydration, analyzeRawOnly } from '../browser/hydration-trap';
import { detectSSR } from '../ssr/detector';
import { detectTechStack } from '../techstack/detector';
import { extractSeo } from '../extractors/seo';
import { groupUrls } from '../classify/taxonomy';
import { fetchSitemaps } from '../compliance/sitemap';
import { probePagination } from '../probes/pagination';
import { probeSearch } from '../probes/search';
import { extractFilters } from '../probes/filter';
import { probeDetail, probeEpisode } from '../probes/detail';
import { summarizeEndpoints } from '../http/replay';
import { parseHtml } from '../utils/dom';
import { AutocrawError, toMessage } from '../utils/errors';
import { ensureUrl, originOf } from '../utils/normalize-url';
import { VERSION } from '../version';

export interface DiscoverOptions {
  config?: AutocrawConfigInput;
  template?: string | null;
  crawl?: boolean;
  crawlPages?: number;
  probes?: boolean;
  onProgress?: (step: string) => void;
}

export async function discoverSite(target: string, options: DiscoverOptions = {}, existing?: Session): Promise<SiteReport> {
  const url = ensureUrl(target);
  const session = existing ?? new Session(options.config);
  const timings: Record<string, number> = {};
  const caveats: string[] = [];
  const progress = options.onProgress ?? (() => undefined);
  const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const started = Date.now();
    try {
      return await fn();
    } finally {
      timings[label] = Date.now() - started;
    }
  };

  try {
    const origin = originOf(url);
    progress('Reading robots.txt');
    const robotsInfo = await time('robots', () => session.robots.load(origin));
    const robots = robotsInfo.policy.summary(robotsInfo.url, robotsInfo.found);
    if (robots.disallowAll && session.config.respectRobots) {
      throw new AutocrawError('E_ROBOTS', `robots.txt disallows crawling the entire site: ${origin}`, { origin });
    }

    progress('Fetching home page');
    const mode = session.config.mode;
    let raw: FetchResult | null = null;
    let rendered: FetchResult | null = null;
    let rawError: unknown = null;
    if (mode !== 'browser') {
      try {
        raw = await time('fetch-http', () => session.fetch(url, { mode: 'http' }));
      } catch (error) {
        if (error instanceof AutocrawError && error.code === 'E_ROBOTS') throw error;
        rawError = error;
      }
    }
    const rawTrapped = raw ? analyzeRawOnly(raw.body, raw.finalUrl).trapped : false;
    const needBrowser = mode === 'browser' || (mode === 'auto' && (!raw || raw.blocked || raw.status >= 400 || rawTrapped));
    if (needBrowser) {
      progress('Rendering with browser');
      try {
        rendered = await time('fetch-browser', () => session.fetch(url, { mode: 'browser' }));
      } catch (error) {
        if (!raw) throw error;
        caveats.push(`Browser rendering failed, using plain HTTP result: ${toMessage(error)}`);
      }
    }
    const primary = rendered && !(rendered.blocked && raw && !raw.blocked) ? rendered : raw;
    if (!primary) throw new AutocrawError('E_NETWORK', `Could not fetch ${url}`, { url }, rawError);
    if (primary.blocked) {
      throw new AutocrawError('E_BLOCKED', `Access blocked by anti-bot protection (${primary.blockReason ?? 'unknown'}) at ${url}. Try --mode browser or a different proxy.`, { url, reason: primary.blockReason });
    }
    if (primary.status >= 400) {
      throw new AutocrawError('E_HTTP', `Home page returned HTTP ${primary.status}: ${url}`, { url, status: primary.status });
    }
    if (primary.via === 'browser' && raw?.blocked) caveats.push(`Plain HTTP was blocked (${raw.blockReason}); the report is based on the browser-rendered page.`);

    const homeUrl = primary.finalUrl;
    const doc = parseHtml(primary.body, homeUrl);
    const rawHtmlForSsr = raw && !raw.blocked ? raw.body : primary.body;
    const hydration = raw && rendered && !raw.blocked ? analyzeHydration(raw.body, rendered.body, homeUrl) : raw ? analyzeRawOnly(raw.body, homeUrl) : null;
    const ssr = detectSSR(rawHtmlForSsr, homeUrl);
    const techstack = detectTechStack({
      url: homeUrl,
      html: primary.body,
      headers: (raw && !raw.blocked ? raw.headers : primary.headers),
      hydration,
      network: primary.network,
      ssr,
    });
    if (hydration?.trapped) caveats.push('Hydration trap: the raw HTML is a shell and content only appears after JavaScript runs. Plain HTTP crawling will miss it; use browser mode.');
    if (!rendered && session.config.mode === 'auto') caveats.push('No browser render was needed, so XHR/fetch endpoints were not captured. Run with --mode browser to capture API calls.');

    progress('Detecting template');
    const match = session.registry.resolve({ url: new URL(homeUrl), html: primary.body, doc, headers: primary.headers }, options.template);
    const template = match.template;
    const base = new URL(homeUrl);
    if (match.template.family === 'generic') caveats.push('No dedicated template matched this site; structure was inferred with generic heuristics.');

    const listing = template.extractListing(doc, homeUrl);
    const seo = extractSeo(doc, homeUrl);

    progress('Reading sitemaps');
    let sitemapUrls: string[] = [];
    let sitemapSources: string[] = [];
    if (session.config.useSitemap) {
      const sitemap = await time('sitemap', () => fetchSitemaps(session.client, origin, robots.sitemaps, { maxUrls: 3000 }));
      sitemapUrls = sitemap.urls;
      sitemapSources = sitemap.sources;
      if (sitemap.truncated) caveats.push('Sitemap was truncated at 3000 URLs for analysis.');
      if (sitemap.failures.length > 0) caveats.push(`${sitemap.failures.length} sitemap file(s) could not be read: ${sitemap.failures.slice(0, 3).map((item) => `${item.url} (${item.reason})`).join('; ')}.`);
      else if (sitemap.sources.length > 0 && sitemap.urls.length === 0) caveats.push('Sitemap index was found but it listed no page URLs.');
    }
    const sitemapGroups = groupUrls(sitemapUrls, template);

    let pagination: SiteReport['pagination'] = null;
    let search: SiteReport['search'] = null;
    let filters: SiteReport['filters'] = null;
    let detail: SiteReport['detail'] = null;
    let watch: SiteReport['watch'] = null;
    let read: SiteReport['read'] = null;
    let media: MediaReport | null = null;

    if (options.probes !== false) {
      progress('Probing listing, pagination and filters');
      const listUrl = template.family === 'generic' ? homeUrl : template.listUrl(base, 1);
      let listDoc = doc;
      let listFinal = homeUrl;
      let listItems = listing;
      if (listUrl !== homeUrl) {
        try {
          const fetched = await time('listing', () => session.document(listUrl, { referer: homeUrl }));
          if (fetched.result.status < 400) {
            listDoc = fetched.doc;
            listFinal = fetched.result.finalUrl;
            const items = template.extractListing(fetched.doc, listFinal);
            if (items.length > 0) listItems = items;
          } else {
            caveats.push(`Listing page ${listUrl} returned HTTP ${fetched.result.status}; its slug may be customized.`);
          }
        } catch (error) {
          caveats.push(`Could not fetch the listing page: ${toMessage(error)}`);
        }
      }
      pagination = await time('pagination', () => probePagination(session, template, listFinal));
      filters = extractFilters(listDoc, listFinal);
      if (!filters.detected) filters = extractFilters(doc, homeUrl);

      progress('Probing search');
      search = await time('search', () => probeSearch(session, template, doc, homeUrl, (listItems.length ? listItems : listing).map((item) => item.title)));

      const detailCandidate = (listItems.length ? listItems : listing)[0]?.url ?? null;
      if (detailCandidate) {
        progress('Probing detail page');
        try {
          const found = await time('detail', () => probeDetail(session, template, detailCandidate));
          if (found) {
            detail = { url: found.url, info: found.info };
            progress('Probing episode page');
            const episode = await time('episode', () => probeEpisode(session, template, found.info, found.url));
            watch = episode.watch;
            read = episode.read;
            media = episode.watch?.info.media ?? null;
          } else {
            caveats.push('The first listing item did not match the detail page template.');
          }
        } catch (error) {
          caveats.push(`Detail probe failed: ${toMessage(error)}`);
        }
      } else {
        caveats.push('No listing items were recognized on the home or listing page, so detail and episode probes were skipped.');
      }
      if (pagination && !pagination.verified && pagination.detected) caveats.push('Pagination was detected but page 2 could not be verified.');
      if (search && !search.verified) caveats.push('Search endpoint could not be verified with a live query.');
    }

    let crawl: SiteReport['crawl'] = null;
    if (options.crawl !== false) {
      progress('Crawling');
      const crawler = new Crawler(session);
      crawl = await time('crawl', () =>
        crawler.crawl(homeUrl, {
          maxPages: options.crawlPages ?? Math.min(session.config.maxPages, 30),
          maxDepth: Math.min(session.config.maxDepth, 2),
          perPatternLimit: 4,
          template,
          computeSeo: false,
        }),
      );
      if (crawl.skipped.some((item) => item.reason === 'robots.txt')) caveats.push('Some URLs were skipped because of robots.txt.');
    }

    const crawledUrls = crawl?.pages.map((page) => page.finalUrl) ?? [];
    const urlGroups: UrlGroup[] = groupUrls([...new Set([...crawledUrls, ...sitemapUrls])], template);
    if (robots.crawlDelay) caveats.push(`robots.txt requests a crawl delay of ${robots.crawlDelay}s; autocraw honors it.`);

    return {
      schemaVersion: 1,
      target: url,
      origin,
      generatedAt: new Date().toISOString(),
      version: VERSION,
      home: { url: homeUrl, status: primary.status, title: seo.title, via: primary.via, seo },
      techstack,
      ssr,
      hydration,
      template: { id: template.id, name: template.name, vendor: template.vendor, confidence: match.confidence, contentType: template.contentType },
      robots,
      sitemap: { found: sitemapSources.length > 0, sources: sitemapSources, totalUrls: sitemapUrls.length, sample: sitemapUrls.slice(0, 10), groups: sitemapGroups.slice(0, 25) },
      urlGroups: urlGroups.slice(0, 60),
      patterns: template.patterns(base),
      listing: listing.slice(0, 24),
      pagination,
      search,
      filters,
      detail,
      watch,
      read,
      media,
      network: summarizeEndpoints(primary.network),
      crawl,
      caveats,
      timings,
    };
  } finally {
    if (!existing) await session.close();
  }
}
