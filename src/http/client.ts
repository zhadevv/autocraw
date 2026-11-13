import { Agent, ProxyAgent, fetch } from 'undici';
import type { Dispatcher } from 'undici';
import type { AutocrawConfig, FetchResult } from '../types';
import { AutocrawError } from '../utils/errors';
import { sleep, jitter } from '../utils/sleep';
import { browserHeaders, detectBlock, pickUserAgent } from '../browser/anti-block';
import { activeCookies } from '../browser/session-file';
import type { SessionFile } from '../browser/session-file';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  referer?: string;
  maxRedirects?: number;
  maxBodyBytes?: number;
  signal?: AbortSignal;
  accept?: string;
  xhr?: boolean;
}

interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<void>;
}

interface ByteStream {
  getReader(): ByteReader;
}

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpClient {
  private readonly dispatcher: Dispatcher;
  private readonly jar = new Map<string, Map<string, string>>();
  private closed = false;

  constructor(
    private readonly config: AutocrawConfig,
    private readonly guard?: (url: string) => Promise<void>,
    stored?: SessionFile | null,
  ) {
    if (stored) this.seedCookies(stored);
    if (config.proxy) {
      try {
        this.dispatcher = new ProxyAgent(config.proxy);
      } catch (error) {
        throw new AutocrawError('E_CONFIG', `Invalid proxy URL: ${config.proxy}`, {}, error);
      }
    } else {
      this.dispatcher = new Agent({
        connect: { timeout: Math.min(config.timeoutMs, 15000) },
        keepAliveTimeout: 10000,
        connections: Math.max(8, config.concurrency * 2),
      });
    }
  }

  get(url: string, options: RequestOptions = {}): Promise<FetchResult> {
    return this.request(url, { ...options, method: 'GET' });
  }

  post(url: string, body: string, options: RequestOptions = {}): Promise<FetchResult> {
    return this.request(url, { ...options, method: 'POST', body });
  }

  async request(url: string, options: RequestOptions = {}): Promise<FetchResult> {
    if (this.closed) throw new AutocrawError('E_HTTP', 'HttpClient is closed');
    const retries = options.retries ?? this.config.retries;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await this.execute(url, options);
        if (RETRY_STATUS.has(result.status) && attempt < retries && !(result.blocked && result.status !== 429)) {
          await sleep(this.backoff(attempt, result.headers['retry-after']), options.signal);
          continue;
        }
        return result;
      } catch (error) {
        lastError = error;
        if (options.signal?.aborted) throw error;
        if (error instanceof AutocrawError && (error.code === 'E_CONFIG' || error.code === 'E_INPUT')) throw error;
        if (attempt >= retries) break;
        await sleep(this.backoff(attempt), options.signal);
      }
    }
    if (lastError instanceof AutocrawError) throw lastError;
    throw new AutocrawError('E_NETWORK', `Request failed: ${url}`, { url }, lastError);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.dispatcher.close().catch(() => undefined);
  }

  private backoff(attempt: number, retryAfter?: string): number {
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 30000);
    }
    return jitter(this.config.retryBaseDelayMs * 2 ** attempt);
  }

  private buildHeaders(url: URL, options: RequestOptions): Record<string, string> {
    const userAgent = pickUserAgent(this.config);
    const headers = browserHeaders(userAgent, this.config.locale);
    if (options.accept) headers.accept = options.accept;
    if (options.xhr) {
      headers['x-requested-with'] = 'XMLHttpRequest';
      headers['sec-fetch-dest'] = 'empty';
      headers['sec-fetch-mode'] = 'cors';
      headers['sec-fetch-site'] = 'same-origin';
      delete headers['upgrade-insecure-requests'];
      delete headers['sec-fetch-user'];
    }
    if (options.referer) {
      headers.referer = options.referer;
      headers['sec-fetch-site'] = 'same-origin';
    }
    Object.assign(headers, this.config.headers, options.headers ?? {});
    const merged = new Map<string, string>();
    const labels = url.hostname.split('.');
    for (let index = Math.max(labels.length - 2, 0); index >= 0; index -= 1) {
      const scoped = this.jar.get(labels.slice(index).join('.'));
      if (scoped) for (const [name, value] of scoped) merged.set(name, value);
    }
    if (merged.size > 0 && !headers.cookie) {
      headers.cookie = [...merged.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    return headers;
  }

  private storeCookies(url: URL, response: { headers: { getSetCookie?: () => string[] } }): void {
    const list = response.headers.getSetCookie?.() ?? [];
    if (list.length === 0) return;
    const jar = this.jar.get(url.hostname) ?? new Map<string, string>();
    for (const cookie of list) {
      const pair = cookie.split(';')[0] ?? '';
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(cookie)) jar.delete(name);
      else jar.set(name, value);
    }
    this.jar.set(url.hostname, jar);
  }

  private seedCookies(stored: SessionFile): void {
    for (const cookie of activeCookies(stored)) {
      const key = cookie.domain.replace(/^\./, '').toLowerCase();
      const jar = this.jar.get(key) ?? new Map<string, string>();
      jar.set(cookie.name, cookie.value);
      this.jar.set(key, jar);
    }
  }

  private async execute(rawUrl: string, options: RequestOptions): Promise<FetchResult> {
    let current: URL;
    try {
      current = new URL(rawUrl);
    } catch (error) {
      throw new AutocrawError('E_INPUT', `Invalid URL: ${rawUrl}`, { url: rawUrl }, error);
    }
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new AutocrawError('E_INPUT', `Unsupported protocol: ${current.protocol}`, { url: rawUrl });
    }
    const started = Date.now();
    const redirects: string[] = [];
    const maxRedirects = options.maxRedirects ?? 10;
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
    const maxBytes = options.maxBodyBytes ?? this.config.maxBodyBytes;
    let method = options.method ?? 'GET';
    let body = options.body;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      if (this.guard) await this.guard(current.toString());
      const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
      if (options.signal) signals.push(options.signal);
      const signal = AbortSignal.any(signals);
      let response;
      try {
        response = await fetch(current.toString(), {
          method,
          headers: this.buildHeaders(current, { ...options, headers: method === 'POST' && body !== undefined ? { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', ...(options.headers ?? {}) } : options.headers }),
          body: method === 'POST' ? body : undefined,
          redirect: 'manual',
          signal,
          dispatcher: this.dispatcher,
        });
      } catch (error) {
        if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
          if (options.signal?.aborted) throw error;
          throw new AutocrawError('E_TIMEOUT', `Request timed out after ${timeoutMs}ms: ${current.toString()}`, { url: current.toString() }, error);
        }
        throw new AutocrawError('E_NETWORK', `Network error for ${current.toString()}: ${error instanceof Error ? error.message : String(error)}`, { url: current.toString() }, error);
      }

      this.storeCookies(current, response);

      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        if (hop === maxRedirects) {
          throw new AutocrawError('E_HTTP', `Too many redirects (${maxRedirects}) for ${rawUrl}`, { url: rawUrl, redirects });
        }
        const location = response.headers.get('location') as string;
        let next: URL;
        try {
          next = new URL(location, current);
        } catch (error) {
          throw new AutocrawError('E_HTTP', `Invalid redirect location "${location}"`, { url: rawUrl }, error);
        }
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 301 || response.status === 302 || response.status === 303) {
          if (method === 'POST') {
            method = 'GET';
            body = undefined;
          }
        }
        redirects.push(next.toString());
        current = next;
        continue;
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value: string, key: string) => {
        headers[key.toLowerCase()] = value;
      });
      const contentType = headers['content-type'] ?? '';
      const text = method === 'HEAD' ? '' : await this.readBody(response.body as unknown as ByteStream | null, contentType, maxBytes, signal);
      const verdict = detectBlock(response.status, headers, text);
      return {
        url: rawUrl,
        finalUrl: current.toString(),
        status: response.status,
        headers,
        body: text,
        contentType,
        durationMs: Date.now() - started,
        via: 'http',
        redirects,
        network: [],
        blocked: verdict.blocked,
        blockReason: verdict.reason,
      };
    }
    throw new AutocrawError('E_HTTP', `Redirect loop for ${rawUrl}`, { url: rawUrl });
  }

  private async readBody(stream: ByteStream | null, contentType: string, maxBytes: number, signal: AbortSignal): Promise<string> {
    if (!stream) return '';
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        if (signal.aborted) throw signal.reason ?? new Error('aborted');
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          const keep = value.byteLength - (total - maxBytes);
          if (keep > 0) chunks.push(value.subarray(0, keep));
          await reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AutocrawError('E_TIMEOUT', 'Timed out while reading response body', {}, error);
      }
      throw new AutocrawError('E_NETWORK', 'Failed while reading response body', {}, error);
    }
    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
    return decodeBuffer(buffer, contentType);
  }
}

export function decodeBuffer(buffer: Buffer, contentType: string): string {
  let charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? null;
  if (!charset) {
    const sniff = buffer.subarray(0, 2048).toString('latin1');
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1]?.toLowerCase() ?? 'utf-8';
  }
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}
