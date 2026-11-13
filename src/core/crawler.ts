import type { CrawlResult, PageRecord, SiteTemplate } from '../types';
import { Session } from './session';
import { CrawlQueue } from './queue';
import { runPool } from './scheduler';
import { parseHtml } from '../utils/dom';
import { normalizeUrl, sameSite } from '../utils/normalize-url';
import { extractLinks } from '../extractors/links';
import { extractSeo } from '../extractors/seo';
import { fastExtract } from '../extractors/fast';
import { classifyUrl, patternKey } from '../classify/taxonomy';
import { isAutocrawError, toMessage } from '../utils/errors';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  include?: string[];
  exclude?: string[];
  sameOrigin?: boolean;
  seeds?: string[];
  perPatternLimit?: number;
  template?: SiteTemplate | null;
  computeSeo?: boolean;
  onPage?: (page: PageRecord) => void;
  signal?: AbortSignal;
}

export class Crawler {
  constructor(private readonly session: Session) {}

  async crawl(start: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    const config = this.session.config;
    const maxPages = options.maxPages ?? config.maxPages;
    const maxDepth = options.maxDepth ?? config.maxDepth;
    const sameOrigin = options.sameOrigin ?? config.sameOrigin;
    const include = (options.include ?? config.include).map((source) => new RegExp(source));
    const exclude = (options.exclude ?? config.exclude).map((source) => new RegExp(source));
    const perPattern = options.perPatternLimit ?? Number.POSITIVE_INFINITY;
    const normalizedStart = normalizeUrl(start);
    if (!normalizedStart) throw new Error(`Invalid start URL: ${start}`);

    const queue = new CrawlQueue();
    const pages: PageRecord[] = [];
    const skipped: CrawlResult['skipped'] = [];
    const errors: CrawlResult['errors'] = [];
    const patternCounts = new Map<string, number>();
    const stats = { pagesFetched: 0, pagesFailed: 0, pagesSkipped: 0, browserFetches: 0, durationMs: 0 };
    const startedAt = Date.now();
    let scheduled = 0;
    let template = options.template ?? null;

    const skip = (url: string, reason: string): void => {
      skipped.push({ url, reason });
      stats.pagesSkipped += 1;
    };

    const admit = (url: string, depth: number, referrer: string | null): void => {
      if (scheduled >= maxPages || queue.has(url)) return;
      if (sameOrigin && !sameSite(url, normalizedStart)) return;
      if (exclude.some((re) => re.test(url))) return skip(url, 'excluded by pattern');
      if (include.length > 0 && !include.some((re) => re.test(url)) && depth > 0) return skip(url, 'not matched by include patterns');
      if (classifyUrl(url, template) === 'asset') return;
      const key = patternKey(new URL(url));
      const count = patternCounts.get(key) ?? 0;
      if (count >= perPattern) return skip(url, `pattern limit reached (${key})`);
      if (queue.add({ url, depth, referrer })) {
        patternCounts.set(key, count + 1);
        scheduled += 1;
      }
    };

    admit(normalizedStart, 0, null);
    for (const seed of options.seeds ?? []) {
      const normalized = normalizeUrl(seed);
      if (normalized) admit(normalized, 1, null);
    }

    await runPool(
      queue,
      config.concurrency,
      async (item) => {
        if (options.signal?.aborted) return;
        const record: PageRecord = {
          url: item.url,
          finalUrl: item.url,
          status: 0,
          depth: item.depth,
          kind: 'other',
          title: null,
          via: 'http',
          durationMs: 0,
          linkCount: 0,
          internalLinks: [],
          wordCount: 0,
          seo: null,
          error: null,
        };
        try {
          const result = await this.session.fetch(item.url, { referer: item.referrer ?? undefined, signal: options.signal });
          record.finalUrl = result.finalUrl;
          record.status = result.status;
          record.via = result.via;
          record.durationMs = result.durationMs;
          if (result.via === 'browser') stats.browserFetches += 1;
          const isHtml = /html/i.test(result.contentType) || /<html[\s>]/i.test(result.body.slice(0, 1000));
          if (result.status >= 400) {
            record.error = result.blocked ? `blocked (${result.blockReason})` : `HTTP ${result.status}`;
            stats.pagesFailed += 1;
            errors.push({ url: item.url, message: record.error });
          } else if (isHtml) {
            const fast = options.computeSeo === false ? fastExtract(result.body, result.finalUrl) : null;
            let doc: Document | null = null;
            let links;
            if (fast) {
              links = fast.links;
              record.title = fast.title;
            } else {
              doc = parseHtml(result.body, result.finalUrl);
              links = extractLinks(doc, result.finalUrl);
              record.title = doc.querySelector('title')?.textContent?.trim() || null;
              if (options.computeSeo !== false) {
                record.seo = extractSeo(doc, result.finalUrl);
                record.wordCount = record.seo.wordCount;
              }
            }
            record.linkCount = links.length;
            record.internalLinks = links.filter((link) => link.internal).map((link) => link.url);
            record.kind = classifyUrl(result.finalUrl, template);
            stats.pagesFetched += 1;
            if (item.depth === 0 && !template) {
              const match = this.session.registry.detect({ url: new URL(result.finalUrl), html: result.body, doc: doc ?? parseHtml(result.body, result.finalUrl), headers: result.headers });
              template = match.template;
              record.kind = classifyUrl(result.finalUrl, template);
            }
            if (item.depth < maxDepth) {
              for (const link of links) {
                if (link.internal) admit(link.url, item.depth + 1, result.finalUrl);
              }
            }
          } else {
            record.kind = classifyUrl(result.finalUrl, template);
            stats.pagesFetched += 1;
          }
        } catch (error) {
          record.error = toMessage(error);
          if (isAutocrawError(error) && error.code === 'E_ROBOTS') {
            skip(item.url, 'robots.txt');
            return;
          }
          stats.pagesFailed += 1;
          errors.push({ url: item.url, message: record.error });
        }
        pages.push(record);
        options.onPage?.(record);
      },
      () => Boolean(options.signal?.aborted),
    );

    stats.durationMs = Date.now() - startedAt;
    return { start: normalizedStart, pages, skipped, errors, stats };
  }
}
