import type { Browser, BrowserContext, Page, Response as PwResponse } from 'playwright';
import type { AutocrawConfig, BrowserAction, FetchResult, NetworkEntry } from '../types';
import type { SessionFile } from './session-file';
import { runActions } from './actions';
import { AutocrawError } from '../utils/errors';
import { sleep } from '../utils/sleep';
import { browserHeaders, detectBlock, pickUserAgent, stealthInitScript } from './anti-block';
import { autoScroll } from './scroll';
import { logger } from '../utils/logger';
import { describeBrowserPath } from '../utils/paths';
import { detectCaptcha, solveCaptcha } from '../resolver';

export interface RenderOptions {
  waitForSelector?: string;
  scroll?: boolean;
  timeoutMs?: number;
  captureBodies?: boolean;
  referer?: string;
  actions?: BrowserAction[];
  screenshot?: 'viewport' | 'full';
}

const MAX_NETWORK_ENTRIES = 300;
const BODY_SNIPPET_BYTES = 4096;

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private starting: Promise<void> | null = null;

  constructor(
    private readonly config: AutocrawConfig,
    private readonly guard?: (url: string) => Promise<void>,
    private readonly stored?: SessionFile | null,
  ) {}

  async start(): Promise<void> {
    if (this.context) return;
    if (this.starting) {
      await this.starting;
      return;
    }
    this.starting = this.launch();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async launch(): Promise<void> {
    let playwright: typeof import('playwright');
    try {
      playwright = await import('playwright');
    } catch (error) {
      throw new AutocrawError('E_BROWSER', 'Playwright is not installed. Run: npm install playwright && npx playwright install chromium', {}, error);
    }
    const executablePath = this.config.browserPath ?? undefined;
    const pathProblem = executablePath ? describeBrowserPath(executablePath) : null;
    if (executablePath && pathProblem) {
      throw new AutocrawError('E_BROWSER', `Invalid browser path: ${pathProblem}. Fix AUTOCRAW_BROWSER_PATH (or --browser-path) with an absolute path to the binary, or unset it and run: npx playwright install chromium`, { executablePath });
    }
    try {
      this.browser = await playwright.chromium.launch({
        executablePath,
        headless: this.config.headless,
        proxy: this.config.proxy ? { server: this.config.proxy } : undefined,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage', '--disable-features=IsolateOrigins,site-per-process'],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const hint = executablePath ? ` The executable at ${executablePath} failed to start: ${message.split('\n')[0]}` : /executable doesn't exist|browserType\.launch/i.test(message) ? ' Install it with: npx playwright install chromium, or point AUTOCRAW_BROWSER_PATH at an existing Chrome/Chromium.' : '';
      throw new AutocrawError('E_BROWSER', `Cannot launch Chromium.${hint}`, {}, error);
    }
    const userAgent = pickUserAgent(this.config);
    const headers = browserHeaders(userAgent, this.config.locale);
    const extra: Record<string, string> = {
      'accept-language': headers['accept-language'] ?? this.config.locale,
      ...this.config.headers,
    };
    this.context = await this.browser.newContext({
      userAgent: this.stored?.userAgent ?? userAgent,
      locale: this.config.locale,
      viewport: { width: 1366, height: 768 },
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: extra,
      storageState: this.stored?.state,
    });
    if (this.config.stealth) await this.context.addInitScript(stealthInitScript(this.config.locale));
    if (this.config.blockResources || this.guard) {
      await this.context.route('**/*', async (route) => {
        const request = route.request();
        if (this.guard && /^https?:/i.test(request.url())) {
          try {
            await this.guard(request.url());
          } catch {
            await route.abort('blockedbyclient').catch(() => undefined);
            return;
          }
        }
        const type = request.resourceType();
        if (this.config.blockResources && (type === 'image' || type === 'font' || type === 'media')) await route.abort().catch(() => undefined);
        else await route.continue().catch(() => undefined);
      });
    }
  }

  async newPage(): Promise<Page> {
    await this.start();
    const page = await (this.context as BrowserContext).newPage();
    page.setDefaultTimeout(this.config.timeoutMs);
    return page;
  }

  async render(url: string, options: RenderOptions = {}): Promise<FetchResult> {
    await this.start();
    const context = this.context as BrowserContext;
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
    const started = Date.now();
    const network: NetworkEntry[] = [];
    const pending: Array<Promise<void>> = [];
    const redirects: string[] = [];
    let page: Page | null = null;
    try {
      page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      if (options.screenshot) {
        await page.route('**/*', async (route) => {
          const requestUrl = route.request().url();
          if (this.guard && /^https?:/i.test(requestUrl)) {
            try {
              await this.guard(requestUrl);
            } catch {
              await route.abort('blockedbyclient').catch(() => undefined);
              return;
            }
          }
          await route.continue().catch(() => undefined);
        });
      }
      page.on('response', (response) => {
        if (network.length >= MAX_NETWORK_ENTRIES) return;
        const request = response.request();
        const type = request.resourceType();
        if (type !== 'xhr' && type !== 'fetch' && type !== 'document' && type !== 'script') return;
        pending.push(this.captureEntry(response, network, options.captureBodies !== false && (type === 'xhr' || type === 'fetch' || type === 'document')));
      });
      page.on('request', (request) => {
        const redirected = request.redirectedFrom();
        if (redirected) redirects.push(request.url());
      });

      let response: PwResponse | null = null;
      try {
        response = await page.goto(url, {
          waitUntil: this.config.waitUntil,
          timeout: timeoutMs,
          referer: options.referer,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/timeout/i.test(message)) throw new AutocrawError('E_TIMEOUT', `Browser navigation timed out after ${timeoutMs}ms: ${url}`, { url }, error);
        throw new AutocrawError('E_BROWSER', `Browser navigation failed for ${url}: ${message}`, { url }, error);
      }

      await this.waitForChallenge(page);
      if (this.config.solveCaptcha) {
        const solved = await this.trySolve(page, timeoutMs);
        if (solved) {
          const after = page.url();
          try {
            if (after !== 'about:blank') await page.goto(after, { waitUntil: this.config.waitUntil, timeout: Math.min(15000, timeoutMs) });
          } catch {
            logger.warn('captcha: reload after solve failed');
          }
        }
      }
      await page.waitForLoadState('networkidle', { timeout: Math.min(6000, timeoutMs) }).catch(() => undefined);
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: Math.min(10000, timeoutMs) }).catch(() => {
          logger.debug(`selector not found: ${options.waitForSelector}`);
        });
      }
      if (options.scroll ?? this.config.scroll) await autoScroll(page);
      if (options.actions && options.actions.length > 0) await runActions(page, options.actions, timeoutMs);
      await Promise.allSettled(pending);

      let screenshot: string | undefined;
      if (options.screenshot) {
        const buffer = await page.screenshot({ fullPage: options.screenshot === 'full', type: 'png' });
        screenshot = buffer.toString('base64');
      }
      const html = await page.content();
      const headers = response ? await response.allHeaders().catch(() => ({} as Record<string, string>)) : {};
      const status = response?.status() ?? 0;
      const verdict = detectBlock(status, headers, html);
      return {
        url,
        finalUrl: page.url(),
        status,
        headers,
        body: html,
        contentType: headers['content-type'] ?? 'text/html',
        durationMs: Date.now() - started,
        via: 'browser',
        redirects,
        network,
        blocked: verdict.blocked,
        blockReason: verdict.reason,
        screenshot,
      };
    } finally {
      await page?.close().catch(() => undefined);
    }
  }

  private async waitForChallenge(page: Page): Promise<void> {
    for (let i = 0; i < 15; i += 1) {
      const title = await page.title().catch(() => '');
      if (!/just a moment|attention required|checking your browser|ddos-guard/i.test(title)) return;
      await sleep(1000);
    }
  }

  private async trySolve(page: Page, timeoutMs: number): Promise<boolean> {
    const kinds = await detectCaptcha(page).catch(() => []);
    if (kinds.length === 0) return false;
    const kind = this.config.captchaKind ?? kinds[0];
    const result = await solveCaptcha(page, { kind, timeoutMs, retries: this.config.retries }).catch(() => null);
    if (result?.solved) {
      logger.info(`captcha: solved ${kind} via ${result.method}`);
      return true;
    }
    logger.warn(`captcha: could not solve ${kind} (${result?.challenge ?? 'unknown'})`);
    return false;
  }

  private async captureEntry(response: PwResponse, sink: NetworkEntry[], withBody: boolean): Promise<void> {
    try {
      const request = response.request();
      const headers = response.headers();
      const contentType = headers['content-type'] ?? '';
      let snippet: string | null = null;
      let size = Number(headers['content-length'] ?? 0) || 0;
      if (withBody && /json|text|xml|javascript|x-component/i.test(contentType)) {
        const body = await response.text().catch(() => null);
        if (body !== null) {
          size = Buffer.byteLength(body);
          snippet = body.slice(0, BODY_SNIPPET_BYTES);
        }
      }
      sink.push({
        url: response.url(),
        method: request.method(),
        status: response.status(),
        resourceType: request.resourceType(),
        contentType,
        requestHeaders: request.headers(),
        postData: request.postData(),
        bodySnippet: snippet,
        size,
      });
    } catch {
      return;
    }
  }

  async close(): Promise<void> {
    const context = this.context;
    const browser = this.browser;
    this.context = null;
    this.browser = null;
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  get active(): boolean {
    return this.context !== null;
  }
}
