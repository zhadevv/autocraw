export type FetchMode = 'http' | 'browser' | 'auto';

import type { CaptchaKind } from '../resolver/shared';

export type RenderStrategy = 'ssr' | 'ssg' | 'csr' | 'rsc' | 'hybrid' | 'unknown';

export type DataFormat =
  | 'html-only'
  | 'json-hydration'
  | 'rsc-flight'
  | 'graphql'
  | 'rest-json'
  | 'mixed'
  | 'unknown';

export type PageKind =
  | 'home'
  | 'listing'
  | 'search'
  | 'detail'
  | 'watch'
  | 'read'
  | 'taxonomy'
  | 'static'
  | 'feed'
  | 'asset'
  | 'other';

export interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  resourceType: string;
  contentType: string;
  requestHeaders: Record<string, string>;
  postData: string | null;
  bodySnippet: string | null;
  size: number;
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  durationMs: number;
  via: 'http' | 'browser';
  redirects: string[];
  network: NetworkEntry[];
  blocked: boolean;
  blockReason: string | null;
  screenshot?: string;
}

export type BrowserAction =
  | { type: 'wait'; ms?: number; selector?: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string }
  | { type: 'press'; key: string }
  | { type: 'scroll'; direction?: 'down' | 'up'; amount?: number }
  | { type: 'hover'; selector: string }
  | { type: 'select'; selector: string; value: string };

export interface AutocrawConfig {
  userAgent: string | null;
  rotateUserAgent: boolean;
  timeoutMs: number;
  retries: number;
  retryBaseDelayMs: number;
  concurrency: number;
  delayMs: number;
  respectRobots: boolean;
  maxPages: number;
  maxDepth: number;
  maxBodyBytes: number;
  sameOrigin: boolean;
  include: string[];
  exclude: string[];
  mode: FetchMode;
  proxy: string | null;
  browserPath: string | null;
  sessionFile: string | null;
  headers: Record<string, string>;
  headless: boolean;
  stealth: boolean;
  blockResources: boolean;
  solveCaptcha: boolean;
  captchaKind: CaptchaKind | null;
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  scroll: boolean;
  useSitemap: boolean;
  locale: string;
  verbose: boolean;
}

export type AutocrawConfigInput = Partial<AutocrawConfig>;

export interface Technology {
  name: string;
  category: 'framework' | 'meta-framework' | 'cms' | 'library' | 'css' | 'cdn' | 'server' | 'analytics' | 'security' | 'ecommerce' | 'builder' | 'language';
  version: string | null;
  confidence: number;
  evidence: string[];
}

export interface TechStackReport {
  technologies: Technology[];
  primaryFramework: string | null;
  cms: string | null;
  renderStrategy: RenderStrategy;
  renderReasons: string[];
  dataFormat: DataFormat;
  dataReasons: string[];
}

export type SSRKind =
  | 'next-pages'
  | 'next-app-rsc'
  | 'nuxt3'
  | 'nuxt2'
  | 'remix'
  | 'sveltekit'
  | 'astro'
  | 'qwik'
  | 'none';

export interface SSRPayload {
  kind: SSRKind;
  source: string;
  sizeBytes: number;
  keys: string[];
  data: unknown;
  meta: Record<string, unknown>;
}

export interface SSRReport {
  detected: SSRKind[];
  payloads: SSRPayload[];
}

export interface HydrationReport {
  trapped: boolean;
  rawTextLength: number;
  renderedTextLength: number;
  rawLinkCount: number;
  renderedLinkCount: number;
  textRatio: number;
  linkRatio: number;
  emptyRoot: boolean;
  reasons: string[];
}

export interface SeoReport {
  title: string | null;
  titleLength: number;
  description: string | null;
  descriptionLength: number;
  canonical: string | null;
  robots: string | null;
  lang: string | null;
  viewport: string | null;
  h1: string[];
  headingCount: Record<string, number>;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  jsonLdTypes: string[];
  hreflang: Array<{ lang: string; href: string }>;
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  issues: string[];
}

export interface LinkInfo {
  url: string;
  text: string;
  rel: string;
  internal: boolean;
}

export interface ImageInfo {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  lazy: boolean;
}

export interface PageRecord {
  url: string;
  finalUrl: string;
  status: number;
  depth: number;
  kind: PageKind;
  title: string | null;
  via: 'http' | 'browser';
  durationMs: number;
  linkCount: number;
  internalLinks: string[];
  wordCount: number;
  seo: SeoReport | null;
  error: string | null;
}

export interface CrawlStats {
  pagesFetched: number;
  pagesFailed: number;
  pagesSkipped: number;
  browserFetches: number;
  durationMs: number;
}

export interface CrawlResult {
  start: string;
  pages: PageRecord[];
  skipped: Array<{ url: string; reason: string }>;
  errors: Array<{ url: string; message: string }>;
  stats: CrawlStats;
}

export interface UrlGroup {
  pattern: string;
  kind: PageKind;
  count: number;
  examples: string[];
}

export interface ListingItem {
  id: string | null;
  title: string;
  url: string;
  image: string | null;
  type: string | null;
  status: string | null;
  badge: string | null;
  latest: string | null;
  rating: string | null;
  hot: boolean;
}

export interface EpisodeItem {
  number: string;
  title: string;
  url: string;
  date: string | null;
  sub: string | null;
  index: number | null;
}

export interface DetailInfo {
  title: string;
  alternative: string | null;
  cover: string | null;
  rating: string | null;
  synopsis: string | null;
  genres: Array<{ name: string; url: string }>;
  tags: string[];
  attributes: Record<string, string>;
  trailer: string | null;
  chapters: EpisodeItem[];
  firstChapter: string | null;
  lastChapter: string | null;
  ajaxChapters: { endpoint: string; method: 'POST' | 'GET' } | null;
}

export interface MediaSource {
  url: string;
  kind: 'iframe' | 'video' | 'source' | 'hls' | 'dash' | 'mp4' | 'webm' | 'track' | 'download' | 'embed' | 'image';
  origin: string;
  hoster: string | null;
  label: string | null;
  encoded: boolean;
}

export interface EncryptionHint {
  type: 'hls-aes-128' | 'hls-sample-aes' | 'base64-embed' | 'packed-js' | 'cryptojs' | 'obfuscated-js' | 'drm-widevine' | 'drm-fairplay' | 'drm-playready' | 'token-url';
  evidence: string;
}

export interface MediaReport {
  sources: MediaSource[];
  encryption: EncryptionHint[];
  hosters: string[];
}

export interface WatchInfo {
  title: string;
  seriesUrl: string | null;
  prev: string | null;
  next: string | null;
  mirrors: Array<{ label: string; url: string; encoded: boolean }>;
  defaultPlayer: string | null;
  downloads: Array<{ label: string; url: string }>;
  playlist: EpisodeItem[];
  media: MediaReport;
}

export interface ReadInfo {
  title: string;
  seriesUrl: string | null;
  prev: string | null;
  next: string | null;
  pages: string[];
  chapterOptions: Array<{ label: string; url: string }>;
}

export interface PaginationInfo {
  detected: boolean;
  scheme: 'path' | 'query' | 'none';
  pattern: string | null;
  current: number | null;
  last: number | null;
  next: string | null;
  prev: string | null;
  verified: boolean;
  notes: string[];
}

export interface SearchInfo {
  detected: boolean;
  method: 'GET' | 'POST';
  action: string | null;
  param: string | null;
  extraParams: Record<string, string>;
  sampleUrl: string | null;
  sampleQuery: string | null;
  resultCount: number;
  verified: boolean;
  liveSearch: boolean;
  notes: string[];
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterControl {
  name: string;
  type: 'checkbox' | 'radio' | 'select' | 'text';
  multiple: boolean;
  options: FilterOption[];
}

export interface FilterInfo {
  detected: boolean;
  action: string | null;
  method: 'GET' | 'POST';
  controls: FilterControl[];
  sampleUrl: string | null;
}

export interface PatternSpec {
  kind: PageKind;
  pattern: string;
  description: string;
  example: string | null;
}

export interface TemplateContext {
  url: URL;
  html: string;
  doc: Document;
  headers: Record<string, string>;
}

export interface SiteTemplate {
  id: string;
  name: string;
  vendor: string;
  family: 'wordpress' | 'generic' | 'custom';
  contentType: 'anime' | 'manga' | 'generic';
  detect(ctx: TemplateContext): number;
  classify(url: URL): PageKind | null;
  patterns(base: URL): PatternSpec[];
  extractListing(doc: Document, base: string): ListingItem[];
  extractDetail(doc: Document, base: string): DetailInfo | null;
  extractChapters(doc: Document, base: string): EpisodeItem[];
  extractWatch(doc: Document, base: string): WatchInfo | null;
  extractRead(doc: Document, base: string): ReadInfo | null;
  searchUrl(base: URL, query: string, page?: number): string;
  listUrl(base: URL, page: number, params?: Record<string, string | string[]>): string;
}

export type MarkdownMode = 'default' | 'ai';
export type AIProviderName = 'openai' | 'anthropic' | 'ollama';
export type MarkdownTemplateName = 'site-structure' | 'seo-audit' | 'techstack';
export type MarkdownLanguage = 'en' | 'id';

export interface AIOptions {
  provider: AIProviderName;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  cache?: boolean;
  cacheDir?: string;
  fallbackToDefault?: boolean;
}

export interface MarkdownOptions {
  mode: MarkdownMode;
  template: MarkdownTemplateName;
  language: MarkdownLanguage;
  frontmatter: boolean;
  toc: boolean;
  maxExamples: number;
  ai?: AIOptions;
}

export type MarkdownOptionsInput = Partial<Omit<MarkdownOptions, 'ai'>> & { ai?: AIOptions };

export interface MarkdownResult {
  markdown: string;
  mode: MarkdownMode;
  template: MarkdownTemplateName;
  usedFallback: boolean;
  cached: boolean;
  provider: AIProviderName | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  warnings: string[];
}

export interface RobotsSummary {
  found: boolean;
  url: string;
  sitemaps: string[];
  crawlDelay: number | null;
  disallowAll: boolean;
  disallowed: string[];
  allowed: string[];
}

export interface SitemapSummary {
  found: boolean;
  sources: string[];
  totalUrls: number;
  sample: string[];
  groups: UrlGroup[];
}

export interface SiteReport {
  schemaVersion: 1;
  target: string;
  origin: string;
  generatedAt: string;
  version: string;
  home: {
    url: string;
    status: number;
    title: string | null;
    via: 'http' | 'browser';
    seo: SeoReport | null;
  };
  techstack: TechStackReport;
  ssr: SSRReport;
  hydration: HydrationReport | null;
  template: { id: string; name: string; vendor: string; confidence: number; contentType: string } | null;
  robots: RobotsSummary;
  sitemap: SitemapSummary;
  urlGroups: UrlGroup[];
  patterns: PatternSpec[];
  listing: ListingItem[];
  pagination: PaginationInfo | null;
  search: SearchInfo | null;
  filters: FilterInfo | null;
  detail: { url: string; info: DetailInfo } | null;
  watch: { url: string; info: WatchInfo } | null;
  read: { url: string; info: ReadInfo } | null;
  media: MediaReport | null;
  network: Array<{ url: string; method: string; status: number; contentType: string }>;
  crawl: CrawlResult | null;
  caveats: string[];
  timings: Record<string, number>;
}

export interface ScrapeOptions {
  formats?: Array<'markdown' | 'html' | 'links' | 'images' | 'metadata' | 'text' | 'screenshot'>;
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  mode?: FetchMode;
  waitForSelector?: string;
  waitFor?: number;
  actions?: BrowserAction[];
  fullPage?: boolean;
}

export interface ScrapeResult {
  url: string;
  finalUrl: string;
  status: number;
  via: 'http' | 'browser';
  markdown?: string;
  html?: string;
  text?: string;
  links?: LinkInfo[];
  images?: ImageInfo[];
  metadata?: SeoReport;
  screenshot?: string;
}

export interface MapLink {
  url: string;
  title: string | null;
  source: 'sitemap' | 'page';
}

export interface MapResult {
  url: string;
  total: number;
  truncated: boolean;
  links: MapLink[];
  sitemaps: string[];
  warnings: string[];
}

export interface BatchItem {
  url: string;
  ok: boolean;
  data?: ScrapeResult;
  error?: { code: string; message: string };
}

export interface ExtractResult {
  url: string;
  ok: boolean;
  data: unknown;
  errors: string[];
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  contentTruncated: boolean;
}
