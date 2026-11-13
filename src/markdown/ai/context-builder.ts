import type { SiteReport } from '../../types';
import { AutocrawError } from '../../utils/errors';
import { countTokens } from './token-counter';

type Slim = Record<string, unknown>;

export interface BuiltContext {
  json: string;
  tokens: number;
  trimmed: string[];
}

function slim(report: SiteReport, examples: number): Slim {
  const seo = report.home.seo;
  return {
    target: report.target,
    origin: report.origin,
    generatedAt: report.generatedAt,
    home: {
      url: report.home.url,
      status: report.home.status,
      title: report.home.title,
      fetchedVia: report.home.via,
      seo: seo
        ? {
            title: seo.title,
            titleLength: seo.titleLength,
            description: seo.description,
            descriptionLength: seo.descriptionLength,
            canonical: seo.canonical,
            robots: seo.robots,
            lang: seo.lang,
            viewport: seo.viewport,
            h1: seo.h1,
            headingCount: seo.headingCount,
            openGraphKeys: Object.keys(seo.openGraph),
            twitterKeys: Object.keys(seo.twitter),
            jsonLdTypes: seo.jsonLdTypes,
            imagesTotal: seo.imagesTotal,
            imagesMissingAlt: seo.imagesMissingAlt,
            internalLinks: seo.internalLinks,
            externalLinks: seo.externalLinks,
            wordCount: seo.wordCount,
            issues: seo.issues,
          }
        : null,
    },
    template: report.template,
    techstack: {
      technologies: report.techstack.technologies.map((tech) => ({ name: tech.name, category: tech.category, version: tech.version, confidence: tech.confidence, evidence: tech.evidence.slice(0, 2) })),
      primaryFramework: report.techstack.primaryFramework,
      cms: report.techstack.cms,
      renderStrategy: report.techstack.renderStrategy,
      renderReasons: report.techstack.renderReasons,
      dataFormat: report.techstack.dataFormat,
      dataReasons: report.techstack.dataReasons,
    },
    ssr: {
      detected: report.ssr.detected,
      payloads: report.ssr.payloads.map((payload) => ({ kind: payload.kind, source: payload.source, sizeBytes: payload.sizeBytes, keys: payload.keys.slice(0, 12), meta: payload.meta })),
    },
    hydration: report.hydration,
    robots: report.robots,
    sitemap: { found: report.sitemap.found, totalUrls: report.sitemap.totalUrls, sources: report.sitemap.sources, groups: report.sitemap.groups.slice(0, 15) },
    urlGroups: report.urlGroups.slice(0, 30).map((group) => ({ ...group, examples: group.examples.slice(0, examples) })),
    patterns: report.patterns,
    listingSample: report.listing.slice(0, examples + 2).map((item) => ({ title: item.title, url: item.url, type: item.type, status: item.status, badge: item.badge })),
    pagination: report.pagination,
    search: report.search,
    filters: report.filters
      ? { ...report.filters, controls: report.filters.controls.map((control) => ({ ...control, options: control.options.slice(0, 15) })) }
      : null,
    detail: report.detail
      ? {
          url: report.detail.url,
          title: report.detail.info.title,
          attributes: report.detail.info.attributes,
          genres: report.detail.info.genres.slice(0, 8).map((genre) => genre.name),
          chapterCount: report.detail.info.chapters.length,
          chapterSample: report.detail.info.chapters.slice(0, examples),
          firstChapter: report.detail.info.firstChapter,
          lastChapter: report.detail.info.lastChapter,
          ajaxChapters: report.detail.info.ajaxChapters,
          hasTrailer: Boolean(report.detail.info.trailer),
        }
      : null,
    watch: report.watch
      ? {
          url: report.watch.url,
          title: report.watch.info.title,
          seriesUrl: report.watch.info.seriesUrl,
          prev: report.watch.info.prev,
          next: report.watch.info.next,
          defaultPlayer: report.watch.info.defaultPlayer,
          mirrors: report.watch.info.mirrors.slice(0, 10),
          downloads: report.watch.info.downloads.slice(0, 6),
          playlistCount: report.watch.info.playlist.length,
        }
      : null,
    read: report.read
      ? {
          url: report.read.url,
          title: report.read.info.title,
          seriesUrl: report.read.info.seriesUrl,
          pageCount: report.read.info.pages.length,
          firstPages: report.read.info.pages.slice(0, 2),
          prev: report.read.info.prev,
          next: report.read.info.next,
          chapterOptions: report.read.info.chapterOptions.length,
        }
      : null,
    media: report.media
      ? { hosters: report.media.hosters, encryption: report.media.encryption, sources: report.media.sources.slice(0, 12).map((source) => ({ kind: source.kind, hoster: source.hoster, origin: source.origin, encoded: source.encoded, url: source.url })) }
      : null,
    network: report.network.slice(0, 15),
    crawlStats: report.crawl?.stats ?? null,
    caveats: report.caveats,
    timings: report.timings,
  };
}

export function buildContext(report: SiteReport, maxTokens: number, maxExamples: number): BuiltContext {
  const trimmed: string[] = [];
  const stages: Array<{ name: string; apply: (data: Slim) => void }> = [
    { name: 'timings', apply: (data) => { delete data.timings; } },
    { name: 'listingSample', apply: (data) => { delete data.listingSample; } },
    { name: 'network', apply: (data) => { data.network = (data.network as unknown[]).slice(0, 5); } },
    { name: 'urlGroups', apply: (data) => { data.urlGroups = (data.urlGroups as unknown[]).slice(0, 12); } },
    { name: 'sitemap.groups', apply: (data) => { data.sitemap = { ...(data.sitemap as Slim), groups: [] }; } },
    { name: 'filters.options', apply: (data) => { const f = data.filters as { controls?: Array<{ options: unknown[] }> } | null; f?.controls?.forEach((c) => { c.options = c.options.slice(0, 5); }); } },
    { name: 'technologies.evidence', apply: (data) => { const t = data.techstack as { technologies: Array<{ evidence?: unknown }> }; t.technologies.forEach((tech) => { delete tech.evidence; }); } },
    { name: 'urlGroups.drop', apply: (data) => { data.urlGroups = (data.urlGroups as unknown[]).slice(0, 5); } },
    { name: 'patterns', apply: (data) => { data.patterns = (data.patterns as unknown[]).slice(0, 10); } },
  ];
  const data = slim(report, Math.max(1, Math.min(maxExamples, 5)));
  let json = JSON.stringify(data);
  let tokens = countTokens(json);
  for (const stage of stages) {
    if (tokens <= maxTokens) break;
    stage.apply(data);
    trimmed.push(stage.name);
    json = JSON.stringify(data);
    tokens = countTokens(json);
  }
  if (tokens > maxTokens) {
    throw new AutocrawError('E_AI_CONTEXT', `The report context needs ${tokens} tokens even after trimming, which exceeds the maxInputTokens budget of ${maxTokens}. Increase maxInputTokens or reduce the crawl.`, { tokens, maxTokens });
  }
  return { json: JSON.stringify(data, null, 1), tokens, trimmed };
}
