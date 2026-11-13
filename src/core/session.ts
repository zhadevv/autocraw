import type { AutocrawConfig, AutocrawConfigInput, BrowserAction, FetchMode, FetchResult } from '../types';
import { resolveConfig } from '../config/schema';
import { HttpClient } from '../http/client';
import { BrowserSession } from '../browser/playwright';
import { analyzeRawOnly } from '../browser/hydration-trap';
import { RobotsCache } from '../compliance/robots';
import { HostRateLimiter } from '../compliance/rate-limiter';
import { TemplateRegistry, defaultRegistry } from '../templates/registry';
import { AutocrawError } from '../utils/errors';
import { parseHtml } from '../utils/dom';
import { logger } from '../utils/logger';
import { loadSessionFile } from '../browser/session-file';

export interface SessionFetchOptions {
  mode?: FetchMode;
  waitForSelector?: string;
  referer?: string;
  skipRobots?: boolean;
  signal?: AbortSignal;
  xhr?: boolean;
  method?: 'GET' | 'POST';
  body?: string;
  scroll?: boolean;
  actions?: BrowserAction[];
  screenshot?: 'viewport' | 'full';
}

export class Session {
  readonly config: AutocrawConfig;
  readonly client: HttpClient;
  readonly browser: BrowserSession;
  readonly robots: RobotsCache;
  readonly limiter: HostRateLimiter;
  readonly registry: TemplateRegistry;
  private closed = false;

  constructor(input: AutocrawConfigInput = {}, registry: TemplateRegistry = defaultRegistry, guard?: (url: string) => Promise<void>) {
    const resolved = resolveConfig(input);
    const stored = resolved.sessionFile ? loadSessionFile(resolved.sessionFile) : null;
    this.config = stored && !resolved.userAgent ? { ...resolved, userAgent: stored.userAgent } : resolved;
    this.client = new HttpClient(this.config, guard, stored);
    this.browser = new BrowserSession(this.config, guard, stored);
    this.robots = new RobotsCache(this.client);
    this.limiter = new HostRateLimiter(this.config.delayMs);
    this.registry = registry;
    if (this.config.verbose) logger.setLevel('debug');
  }

  private async checkRobots(url: string): Promise<void> {
    if (!this.config.respectRobots) return;
    const origin = new URL(url).origin;
    const { policy } = await this.robots.load(origin);
    const delay = policy.crawlDelay();
    if (delay !== null && delay > 0) this.limiter.setDelay(new URL(url).host, delay * 1000);
    if (!policy.isAllowed(url)) {
      throw new AutocrawError('E_ROBOTS', `Blocked by robots.txt: ${url}`, { url });
    }
  }

  async fetch(url: string, options: SessionFetchOptions = {}): Promise<FetchResult> {
    if (this.closed) throw new AutocrawError('E_HTTP', 'Session is closed');
    const mode = options.mode ?? this.config.mode;
    const isPost = options.method === 'POST';
    if (!options.skipRobots) await this.checkRobots(url);
    const host = new URL(url).host;
    await this.limiter.wait(host, options.signal);

    const needsBrowser = Boolean((options.actions && options.actions.length > 0) || options.screenshot);
    if (needsBrowser && (mode === 'http' || isPost)) {
      throw new AutocrawError('E_INPUT', 'Actions and screenshots need a browser. Use mode auto or browser.');
    }
    if ((mode === 'browser' || needsBrowser) && !isPost) {
      return this.browser.render(url, { waitForSelector: options.waitForSelector, referer: options.referer, scroll: options.scroll, actions: options.actions, screenshot: options.screenshot });
    }

    const httpOptions = { referer: options.referer, signal: options.signal, xhr: options.xhr };
    let result = isPost ? await this.client.post(url, options.body ?? '', httpOptions) : await this.client.get(url, httpOptions);
    if (result.status === 429) this.limiter.penalize(host, 3000);
    if (mode === 'http' || isPost) return result;

    const html = /html|xml/i.test(result.contentType) || result.contentType === '';
    const escalate = result.blocked || (html && result.status === 200 && analyzeRawOnly(result.body, result.finalUrl).trapped);
    if (!escalate) return result;

    logger.debug(`escalating to browser: ${url} (${result.blockReason ?? 'client-side shell'})`);
    try {
      const rendered = await this.browser.render(url, { waitForSelector: options.waitForSelector, referer: options.referer, scroll: options.scroll });
      if (!rendered.blocked || result.blocked) result = rendered;
    } catch (error) {
      if (result.blocked) throw error;
      logger.debug(`browser escalation failed, keeping HTTP result: ${error instanceof Error ? error.message : String(error)}`);
    }
    return result;
  }

  async document(url: string, options: SessionFetchOptions = {}): Promise<{ result: FetchResult; doc: Document }> {
    const result = await this.fetch(url, options);
    return { result, doc: parseHtml(result.body, result.finalUrl) };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.allSettled([this.browser.close(), this.client.close()]);
  }
}
