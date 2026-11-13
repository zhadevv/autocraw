import { EventEmitter } from 'node:events';
import type { AutocrawConfigInput, BatchItem, ExtractResult, MapResult, MarkdownOptionsInput, MarkdownResult, MediaReport, ScrapeOptions, ScrapeResult, SiteReport, SiteTemplate } from './types';
import { Session } from './core/session';
import { Crawler } from './core/crawler';
import type { CrawlOptions } from './core/crawler';
import { discoverSite } from './core/discovery';
import type { DiscoverOptions } from './core/discovery';
import { inspectPage } from './core/inspect';
import type { InspectResult } from './core/inspect';
import { scrapePage } from './core/scrape';
import { batchScrape } from './core/batch';
import { mapSite } from './core/map';
import { findPageSelectors } from './core/selectors';
import type { MapOptions } from './core/map';
import { extractMany } from './core/extract';
import type { ExtractOptions } from './core/extract';
import { inspectMediaPage } from './probes/watch';
import { generateMarkdown } from './markdown';
import { TemplateRegistry, defaultRegistry } from './templates/registry';
import { ensureUrl } from './utils/normalize-url';

export interface AutocrawHooks {
  urlGuard?: (url: string) => Promise<void>;
}

export class Autocraw extends EventEmitter {
  readonly session: Session;

  constructor(config: AutocrawConfigInput = {}, registry: TemplateRegistry = defaultRegistry, hooks: AutocrawHooks = {}) {
    super();
    this.session = new Session(config, registry, hooks.urlGuard);
  }

  scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    return scrapePage(this.session, ensureUrl(url), options);
  }

  batchScrape(urls: string[], options: { scrape?: ScrapeOptions; concurrency?: number } = {}): Promise<BatchItem[]> {
    return batchScrape(this.session, urls, { ...options, onItem: (item, index, total) => this.emit('item', item, index, total) });
  }

  map(url: string, options?: MapOptions): Promise<MapResult> {
    return mapSite(this.session, url, options);
  }

  crawl(url: string, options: CrawlOptions = {}) {
    const onPage = options.onPage;
    return new Crawler(this.session).crawl(ensureUrl(url), {
      ...options,
      onPage: (page) => {
        this.emit('page', page);
        onPage?.(page);
      },
    });
  }

  discover(url: string, options: Omit<DiscoverOptions, 'config'> = {}): Promise<SiteReport> {
    const onProgress = options.onProgress;
    return discoverSite(
      url,
      {
        ...options,
        onProgress: (step) => {
          this.emit('progress', step);
          onProgress?.(step);
        },
      },
      this.session,
    );
  }

  inspect(url: string, compare = false): Promise<InspectResult> {
    return inspectPage(this.session, ensureUrl(url), compare);
  }

  media(url: string, followFrames = false): Promise<MediaReport> {
    return inspectMediaPage(this.session, ensureUrl(url), followFrames);
  }

  selectors(url: string, extraUrls: string[] = []) {
    return findPageSelectors(this.session, url, extraUrls);
  }

  extract(urls: string | string[], options: ExtractOptions): Promise<ExtractResult[]> {
    return extractMany(this.session, Array.isArray(urls) ? urls : [urls], options);
  }

  markdown(report: SiteReport, options?: MarkdownOptionsInput, signal?: AbortSignal): Promise<MarkdownResult> {
    return generateMarkdown(report, options, signal);
  }

  registerTemplate(template: SiteTemplate): this {
    this.session.registry.register(template);
    return this;
  }

  close(): Promise<void> {
    return this.session.close();
  }
}

export { Session } from './core/session';
export { Crawler } from './core/crawler';
export { discoverSite } from './core/discovery';
export { inspectPage } from './core/inspect';
export { scrapePage } from './core/scrape';
export { batchScrape } from './core/batch';
export { mapSite } from './core/map';
export { findPageSelectors } from './core/selectors';
export { findSelectors, selectorOf } from './classify/selector-finder';
export type { SelectorReport } from './classify/selector-finder';
export { extractFromUrl, extractMany, parseJsonLoose } from './core/extract';
export { validateJsonSchema } from './core/json-schema';
export { createApiServer } from './server';
export { assertPublicUrl, createUrlGuard, isPrivateAddress } from './server/ssrf';
export { parseActions } from './browser/actions';
export { inspectMediaPage } from './probes/watch';
export { generateMarkdown, generateDefaultMarkdown, generateAiMarkdown, resolveMarkdownOptions } from './markdown';
export { createProvider, OpenAIProvider, AnthropicProvider } from './markdown/ai/providers';
export { TemplateRegistry, defaultRegistry } from './templates/registry';
export { AnimeStreamTemplate } from './templates/wordpress/animestream';
export { MadaraTemplate } from './templates/wordpress/madara';
export { GenericTemplate } from './templates/generic';
export { BaseTemplate } from './templates/base';
export { HttpClient } from './http/client';
export { BrowserSession } from './browser/playwright';
export { interceptPage, analyzeInterceptions, classifyEntry, classifyHost, classifyKind } from './browser/intercept';
export { solveCaptcha, detectCaptcha, detectCaptchaKind, detectKinds, getResolver, registerResolver, listResolvers, grepSitekey, installSitekeyHook, installGeetestHook, solvePowToken, leadingZeroBits, isInterstitial, awsWaf, cloudflareChallenges, cloudflareTurnstile, geetest, powblock, wobble, recaptchaV2, recaptchaV3, recaptchaEnterprise } from './resolver';
export { detectTechStack } from './techstack/detector';
export { detectSSR } from './ssr/detector';
export { analyzeHydration, analyzeRawOnly } from './browser/hydration-trap';
export { detectMedia, decodeMirrorValue } from './media/detector';
export { unpackPacker } from './media/encryption';
export { classifyUrl, groupUrls, patternKey } from './classify/taxonomy';
export { RobotsPolicy } from './compliance/robots';
export { parseSitemap } from './compliance/sitemap';
export { extractSeo } from './extractors/seo';
export { htmlToMarkdown } from './extractors/text';
export { exportReport, EXPORT_FORMATS } from './report/export';
export { toJson } from './report/json';
export { resolveConfig } from './config/schema';
export { defaultConfig } from './config/defaults';
export { AutocrawError, isAutocrawError } from './utils/errors';
export { normalizeUrl, ensureUrl } from './utils/normalize-url';
export { VERSION } from './version';
export type { CrawlOptions } from './core/crawler';
export type { MapOptions } from './core/map';
export type { ExtractOptions } from './core/extract';
export type { Engine, ApiServerOptions } from './server';
export type { DiscoverOptions } from './core/discovery';
export type { InspectResult } from './core/inspect';
export type { CaptchaKind, Resolver, ResolverResult, SolveOptions, DetectionInput } from './resolver';
export type { InterceptEntry, ClassifiedEntry, DomainSummary, EndpointSummary, InterceptTargetResult, InterceptOptions, HostRelation, PathKind } from './browser/intercept';
export type * from './types';
