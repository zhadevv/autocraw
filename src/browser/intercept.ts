import type { Page, Response as PwResponse } from 'playwright';
import { logger } from '../utils/logger';
import { sleep } from '../utils/sleep';

export interface InterceptEntry {
  readonly url: string;
  readonly path: string;
  readonly method: string;
  readonly status: number;
  readonly resourceType: string;
  readonly contentType: string;
  readonly size: number;
  readonly params: Readonly<Record<string, string>>;
  readonly postData: string | null;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodySnippet: string | null;
}

export type HostRelation = 'base' | 'subdomain' | 'external';

export type PathKind =
  | 'next-data'
  | 'rsc'
  | 'data'
  | 'api'
  | 'versioned-api'
  | 'graphql'
  | 'trpc'
  | 'media'
  | 'static'
  | 'document'
  | 'other';

export interface ClassifiedEntry extends InterceptEntry {
  readonly host: string;
  readonly relation: HostRelation;
  readonly kind: PathKind;
}

export interface DomainSummary {
  readonly host: string;
  readonly relation: HostRelation;
  readonly requests: number;
  readonly bytes: number;
  readonly errors: number;
  readonly kinds: readonly PathKind[];
}

export interface EndpointSummary {
  readonly url: string;
  readonly method: string;
  readonly requests: number;
  readonly statuses: readonly number[];
  readonly kinds: readonly PathKind[];
}

export interface InterceptTargetResult {
  readonly targetUrl: string;
  readonly sourceUrl: string | null;
  readonly durationMs: number;
  readonly totalRequests: number;
  readonly distinctHosts: number;
  readonly domains: readonly DomainSummary[];
  readonly endpoints: readonly EndpointSummary[];
  readonly notes: readonly string[];
  readonly entries: readonly ClassifiedEntry[];
}

export interface InterceptOptions {
  readonly sourceUrl?: string | null;
  readonly clicks?: number;
  readonly interact?: boolean;
  readonly scroll?: boolean;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly maxEntries?: number;
}

const MAX_ENTRIES = 300;
const BODY_SNIPPET_BYTES = 4096;

export function classifyHost(url: string, baseHost: string): { host: string; relation: HostRelation } {
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    host = url;
  }
  const relation: HostRelation = host === baseHost ? 'base' : host.endsWith(`.${baseHost}`) ? 'subdomain' : 'external';
  return { host, relation };
}

export function classifyKind(url: string, resourceType: string, contentType: string): PathKind {
  let path = '';
  try {
    path = new URL(url).pathname + new URL(url).search;
  } catch {
    path = url;
  }
  const lower = path.toLowerCase();
  if (/\/_next\/data\//i.test(lower)) return 'next-data';
  if (/[?&]rsc=/i.test(lower)) return 'rsc';
  if (/\/_data\//i.test(lower)) return 'data';
  if (/\/graphql(\/|$)/i.test(lower)) return 'graphql';
  if (/\/trpc\//i.test(lower)) return 'trpc';
  if (/\/api(\/|$)/i.test(lower)) return 'api';
  if (/\/v\d+(\/|$)/i.test(lower)) return 'versioned-api';
  if (/image|audio|video|font/i.test(resourceType) || /^(image|audio|video|font)\//i.test(contentType)) return 'media';
  if (/document|frame/i.test(resourceType)) return 'document';
  if (/script|stylesheet/i.test(resourceType) || /(javascript|css)/i.test(contentType)) return 'static';
  return 'other';
}

export function classifyEntry(entry: InterceptEntry, baseHost: string): ClassifiedEntry {
  const { host, relation } = classifyHost(entry.url, baseHost);
  return { ...entry, host, relation, kind: classifyKind(entry.url, entry.resourceType, entry.contentType) };
}

export function analyzeInterceptions(entries: readonly InterceptEntry[], baseHost: string): {
  domains: DomainSummary[];
  endpoints: EndpointSummary[];
  notes: string[];
} {
  const classified = entries.map((entry) => classifyEntry(entry, baseHost));
  const byHost = new Map<string, ClassifiedEntry[]>();
  for (const entry of classified) {
    const list = byHost.get(entry.host) ?? [];
    list.push(entry);
    byHost.set(entry.host, list);
  }
  const domains = [...byHost.entries()]
    .map(([host, list]) => {
      const kinds = [...new Set(list.map((entry) => entry.kind))];
      return {
        host,
        relation: list[0].relation,
        requests: list.length,
        bytes: list.reduce((sum, entry) => sum + entry.size, 0),
        errors: list.filter((entry) => entry.status >= 400).length,
        kinds,
      };
    })
    .sort((left, right) => right.requests - left.requests);

  const byEndpoint = new Map<string, EndpointSummary>();
  for (const entry of classified) {
    const key = `${entry.method} ${entry.url}`;
    const existing = byEndpoint.get(key);
    if (existing) {
      byEndpoint.set(key, {
        ...existing,
        requests: existing.requests + 1,
        statuses: [...new Set([...existing.statuses, entry.status])],
        kinds: [...new Set([...existing.kinds, entry.kind])],
      });
      continue;
    }
    byEndpoint.set(key, { url: entry.url, method: entry.method, requests: 1, statuses: [entry.status], kinds: [entry.kind] });
  }
  const endpoints = [...byEndpoint.values()].sort((left, right) => right.requests - left.requests).slice(0, 60);

  const notes: string[] = [];
  const apiKinds = ['api', 'versioned-api', 'graphql', 'trpc', 'next-data', 'rsc', 'data'];
  if (!classified.some((entry) => apiKinds.includes(entry.kind))) notes.push('no api-like payloads observed (json, rsc, graphql, trpc or next data)');
  if (!domains.some((domain) => domain.relation === 'subdomain')) notes.push('no subdomain traffic detected; all requests share the base host');
  if (classified.length === 0) notes.push('no network responses recorded');
  return { domains, endpoints, notes };
}

async function captureEntry(response: PwResponse): Promise<InterceptEntry | null> {
  const request = response.request();
  const headers = response.headers();
  const contentType = headers['content-type'] ?? '';
  let path = response.url();
  const params: Record<string, string> = {};
  try {
    const parsed = new URL(response.url());
    path = parsed.pathname;
    for (const [key, value] of parsed.searchParams) params[key] = value;
  } catch {
    path = response.url();
  }
  let snippet: string | null = null;
  let size = Number(headers['content-length'] ?? 0) || 0;
  if (/json|text|xml|javascript|x-component/i.test(contentType)) {
    const body = await response.text().catch(() => null);
    if (body !== null) {
      size = Buffer.byteLength(body);
      snippet = body.slice(0, BODY_SNIPPET_BYTES);
    }
  }
  return {
    url: response.url(),
    path,
    method: request.method(),
    status: response.status(),
    resourceType: request.resourceType(),
    contentType,
    size,
    params,
    postData: request.postData(),
    requestHeaders: request.headers(),
    headers,
    bodySnippet: snippet,
  };
}

async function clickAround(page: Page, count: number, signal?: AbortSignal): Promise<number> {
  const points = await page.evaluate(() => {
    const selectors = 'button, [role="button"], summary, a[href^="#"], [data-tab], [role="tab"], .accordion, [class*="toggle"]';
    const out: Array<{ x: number; y: number }> = [];
    for (const element of Array.from(document.querySelectorAll(selectors))) {
      const box = element.getBoundingClientRect();
      if (box.width < 12 || box.height < 10) continue;
      if (getComputedStyle(element).visibility === 'hidden') continue;
      out.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    return out;
  }).catch(() => []);
  let clicked = 0;
  for (const point of points.slice(0, Math.max(1, count))) {
    await page.mouse.click(point.x, point.y).catch(() => undefined);
    await sleep(500 + Math.random() * 700, signal);
    clicked += 1;
  }
  return clicked;
}

async function scrollToBottom(page: Page, signal?: AbortSignal): Promise<void> {
  const height = await page.evaluate(() => document.body?.scrollHeight ?? 0).catch(() => 0);
  if (height < 400) return;
  const steps = Math.min(12, Math.max(4, Math.round(height / 600)));
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.wheel(0, Math.round(height / steps)).catch(() => undefined);
    await sleep(180 + Math.random() * 250, signal);
  }
}

export async function interceptPage(page: Page, targetUrl: string, options: InterceptOptions = {}): Promise<InterceptTargetResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 45000;
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  const entries: InterceptEntry[] = [];

  const baseHost = new URL(targetUrl).host;
  let sourceUrl: string | null = options.sourceUrl ?? null;
  if (sourceUrl) {
    try {
      await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 45000) });
      await sleep(400 + Math.random() * 300, options.signal);
    } catch (error) {
      logger.warn('intercept: source navigation failed', error instanceof Error ? error.message.split('\n')[0] : String(error));
      sourceUrl = null;
    }
  }

  const onResponse = (response: PwResponse): void => {
    if (entries.length >= maxEntries) return;
    void captureEntry(response).then((entry) => {
      if (entry && entries.length < maxEntries) entries.push(entry);
    });
  };
  page.on('response', onResponse);

  try {
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 45000) });
    } catch (error) {
      logger.warn('intercept: target navigation failed', error instanceof Error ? error.message.split('\n')[0] : String(error));
    }
    await sleep(700 + Math.random() * 500, options.signal);
    if (options.interact !== false) {
      const clicks = options.clicks ?? 2;
      if (clicks > 0) await clickAround(page, clicks, options.signal);
      if (options.scroll !== false) await scrollToBottom(page, options.signal);
      await sleep(400, options.signal);
    }
  } finally {
    page.off('response', onResponse);
  }

  const classified = entries.map((entry) => classifyEntry(entry, baseHost));
  const { domains, endpoints, notes } = analyzeInterceptions(entries, baseHost);
  return {
    targetUrl,
    sourceUrl,
    durationMs: Date.now() - started,
    totalRequests: entries.length,
    distinctHosts: domains.length,
    domains,
    endpoints,
    notes,
    entries: classified,
  };
}
