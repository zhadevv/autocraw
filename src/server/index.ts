import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { z } from 'zod';
import { actionsSchema } from '../browser/actions';
import type { CrawlOptions } from '../core/crawler';
import type { DiscoverOptions } from '../core/discovery';
import type { ExtractOptions } from '../core/extract';
import type { MapOptions } from '../core/map';
import type { AIOptions, BatchItem, CrawlResult, ExtractResult, MapResult, MarkdownOptionsInput, MarkdownResult, ScrapeOptions, ScrapeResult, SiteReport } from '../types';
import { inferProvider } from '../cli/parsers/args';
import { isAutocrawError, toMessage } from '../utils/errors';
import type { ErrorCode } from '../utils/errors';
import { VERSION } from '../version';

export interface Engine {
  scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;
  map(url: string, options?: MapOptions): Promise<MapResult>;
  crawl(url: string, options?: CrawlOptions): Promise<CrawlResult>;
  discover(url: string, options?: Omit<DiscoverOptions, 'config'>): Promise<SiteReport>;
  markdown(report: SiteReport, options?: MarkdownOptionsInput): Promise<MarkdownResult>;
  extract(urls: string | string[], options: ExtractOptions): Promise<ExtractResult[]>;
  batchScrape(urls: string[], options?: { scrape?: ScrapeOptions; concurrency?: number }): Promise<BatchItem[]>;
}

export interface ApiServerOptions {
  engine: Engine;
  apiKey?: string | null;
  maxConcurrent?: number;
  maxBodyBytes?: number;
  guard?: (url: string) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

const url = z.string().min(1).max(2048);
const mode = z.enum(['http', 'browser', 'auto']);
const formats = z.array(z.enum(['markdown', 'html', 'text', 'links', 'images', 'metadata', 'screenshot'])).min(1).max(7);
const tags = z.array(z.string().min(1).max(200)).max(20);

const scrapeShape = {
  formats: formats.optional(),
  onlyMainContent: z.boolean().optional(),
  includeTags: tags.optional(),
  excludeTags: tags.optional(),
  mode: mode.optional(),
  waitFor: z.number().int().min(0).max(30000).optional(),
  waitForSelector: z.string().min(1).max(500).optional(),
  actions: actionsSchema.optional(),
  fullPage: z.boolean().optional(),
};

const schemas = {
  scrape: z.object({ url, ...scrapeShape }),
  map: z.object({ url, search: z.string().max(200).optional(), limit: z.number().int().min(1).max(50000).optional(), sitemap: z.enum(['include', 'only', 'skip']).optional(), includeSubdomains: z.boolean().optional() }),
  crawl: z.object({ url, maxPages: z.number().int().min(1).max(100).optional(), maxDepth: z.number().int().min(0).max(5).optional(), include: z.array(z.string().max(300)).max(20).optional(), exclude: z.array(z.string().max(300)).max(20).optional(), perPatternLimit: z.number().int().min(1).max(100).optional() }),
  discover: z.object({ url, template: z.string().max(100).optional(), crawl: z.boolean().optional(), probes: z.boolean().optional(), crawlPages: z.number().int().min(1).max(60).optional(), markdown: z.object({ template: z.enum(['site-structure', 'seo-audit', 'techstack']).optional(), language: z.enum(['en', 'id']).optional() }).optional() }),
  extract: z.object({
    urls: z.array(url).min(1).max(10),
    schema: z.record(z.string(), z.unknown()).optional(),
    prompt: z.string().max(4000).optional(),
    onlyMainContent: z.boolean().optional(),
    mode: mode.optional(),
    ai: z.object({ provider: z.enum(['openai', 'anthropic']).optional(), apiKey: z.string().min(1).optional(), model: z.string().optional(), baseUrl: z.string().optional() }).optional(),
  }),
  batch: z.object({ urls: z.array(url).min(1).max(50), concurrency: z.number().int().min(1).max(8).optional(), ...scrapeShape }),
};

const STATUS: Partial<Record<ErrorCode, number>> = {
  E_INPUT: 400,
  E_CONFIG: 400,
  E_PARSE: 422,
  E_ROBOTS: 403,
  E_BLOCKED: 502,
  E_HTTP: 502,
  E_NETWORK: 502,
  E_TIMEOUT: 504,
  E_BROWSER: 502,
  E_CAPTCHA: 502,
  E_AI: 502,
  E_AI_AUTH: 502,
  E_AI_RATE_LIMIT: 429,
  E_AI_CONTEXT: 422,
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function authorized(request: IncomingMessage, apiKey: string | null | undefined): boolean {
  if (!apiKey) return true;
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return timingSafeEqual(digest(token), digest(apiKey));
}

function readBody(request: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'E_TOO_LARGE', `Request body exceeds ${limit} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'E_INPUT', 'Request body is not valid JSON.'));
      }
    });
    request.on('error', (error) => reject(error));
  });
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  response.end(body);
}

function parse<T>(schema: { safeParse(value: unknown): { success: boolean; data?: T; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = (result.error?.issues ?? []).map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`);
    throw new HttpError(400, 'E_INPUT', `Invalid request: ${issues.join('; ')}`);
  }
  return result.data as T;
}

export function createApiServer(options: ApiServerOptions): Server {
  const { engine } = options;
  const maxConcurrent = options.maxConcurrent ?? 4;
  const maxBody = options.maxBodyBytes ?? 1024 * 1024;
  const env = options.env ?? process.env;
  let active = 0;

  const check = async (...urls: string[]): Promise<void> => {
    if (!options.guard) return;
    for (const item of urls) {
      const target = /^[a-z][a-z0-9+.-]*:/i.test(item) ? item : `https:${'/'.repeat(2)}${item}`;
      try {
        await options.guard(target);
      } catch (error) {
        if (isAutocrawError(error) || error instanceof HttpError) throw new HttpError(400, 'E_INPUT', toMessage(error));
        throw error;
      }
    }
  };

  const scrapeOptions = (body: z.infer<typeof schemas.scrape>): ScrapeOptions => ({
    formats: body.formats,
    onlyMainContent: body.onlyMainContent,
    includeTags: body.includeTags,
    excludeTags: body.excludeTags,
    mode: body.mode,
    waitFor: body.waitFor,
    waitForSelector: body.waitForSelector,
    actions: body.actions as ScrapeOptions['actions'],
    fullPage: body.fullPage,
  });

  const routes: Record<string, (body: unknown) => Promise<unknown>> = {
    '/v1/scrape': async (raw) => {
      const body = parse<z.infer<typeof schemas.scrape>>(schemas.scrape, raw);
      await check(body.url);
      return engine.scrape(body.url, scrapeOptions(body));
    },
    '/v1/map': async (raw) => {
      const body = parse<z.infer<typeof schemas.map>>(schemas.map, raw);
      await check(body.url);
      return engine.map(body.url, { search: body.search, limit: body.limit, sitemap: body.sitemap, includeSubdomains: body.includeSubdomains });
    },
    '/v1/crawl': async (raw) => {
      const body = parse<z.infer<typeof schemas.crawl>>(schemas.crawl, raw);
      await check(body.url);
      return engine.crawl(body.url, { maxPages: body.maxPages ?? 25, maxDepth: body.maxDepth, include: body.include, exclude: body.exclude, perPatternLimit: body.perPatternLimit, computeSeo: false });
    },
    '/v1/discover': async (raw) => {
      const body = parse<z.infer<typeof schemas.discover>>(schemas.discover, raw);
      await check(body.url);
      const report = await engine.discover(body.url, { template: body.template ?? null, crawl: body.crawl, probes: body.probes, crawlPages: body.crawlPages });
      const markdown = body.markdown ? await engine.markdown(report, { mode: 'default', ...body.markdown }) : null;
      return { report, markdown: markdown?.markdown ?? null };
    },
    '/v1/extract': async (raw) => {
      const body = parse<z.infer<typeof schemas.extract>>(schemas.extract, raw);
      await check(...body.urls);
      let ai: AIOptions;
      try {
        const { provider, apiKey } = inferProvider({ aiProvider: body.ai?.provider, apiKey: body.ai?.apiKey }, env);
        ai = { provider, apiKey, model: body.ai?.model, baseUrl: body.ai?.baseUrl };
      } catch (error) {
        throw new HttpError(400, 'E_CONFIG', toMessage(error));
      }
      return engine.extract(body.urls, { ai, schema: body.schema, prompt: body.prompt, onlyMainContent: body.onlyMainContent, mode: body.mode });
    },
    '/v1/batch/scrape': async (raw) => {
      const body = parse<z.infer<typeof schemas.batch>>(schemas.batch, raw);
      await check(...body.urls);
      return engine.batchScrape(body.urls, { scrape: scrapeOptions({ url: body.urls[0] as string, ...body }), concurrency: body.concurrency });
    },
  };

  return createServer(async (request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    try {
      if (request.method === 'GET' && (path === '/health' || path === '/')) {
        return send(response, 200, { success: true, data: { status: 'ok', version: VERSION } });
      }
      const handler = routes[path];
      if (!handler) throw new HttpError(404, 'E_NOT_FOUND', `No route for ${path}.`);
      if (request.method !== 'POST') throw new HttpError(405, 'E_METHOD', 'Use POST for this endpoint.');
      if (!authorized(request, options.apiKey)) throw new HttpError(401, 'E_UNAUTHORIZED', 'Missing or invalid bearer token.');
      if (active >= maxConcurrent) throw new HttpError(429, 'E_BUSY', 'The server is at capacity. Retry shortly.');
      active += 1;
      try {
        const data = await handler(await readBody(request, maxBody));
        send(response, 200, { success: true, data });
      } finally {
        active -= 1;
      }
    } catch (error) {
      if (error instanceof HttpError) return send(response, error.status, { success: false, error: { code: error.code, message: error.message } });
      if (isAutocrawError(error)) return send(response, STATUS[error.code] ?? 500, { success: false, error: { code: error.code, message: error.message } });
      send(response, 500, { success: false, error: { code: 'E_INTERNAL', message: 'Internal server error.' } });
    }
  });
}
