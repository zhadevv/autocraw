import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  cookieHeader,
  grepSitekey,
  injectTurnstileWidget,
  installSitekeyHook,
  isInterstitial,
  isTurnstile,
  readPage,
  readUserAgent,
  resolverResult,
  sleep,
  solveTurnstileWidget,
  turnstileSitekey,
  turnstileWidgetState,
  waitForSitekey,
} from './shared';
import type { Resolver, ResolverResult, SolveOptions, WidgetOutcome } from './shared';

const ERROR_LABELS: Record<string, string> = {
  '110100': 'invalid-sitekey',
  '110110': 'sitekey-not-found',
  '110200': 'domain-not-authorized',
  '110600': 'challenge-timeout',
  '110620': 'interaction-timeout',
  '200500': 'iframe-load-failed',
};

function errorLabel(code: string): string {
  return ERROR_LABELS[code] ?? `turnstile-${code}`;
}

function widgetHtml(sitekey: string, action?: string, cdata?: string): string {
  const attributes = [`data-sitekey="${sitekey}"`];
  const options = [`sitekey: ${JSON.stringify(sitekey)}`];
  if (action) {
    attributes.push(`data-action="${action}"`);
    options.push(`action: ${JSON.stringify(action)}`);
  }
  if (cdata) {
    attributes.push(`data-cdata="${cdata}"`);
    options.push(`cdata: ${JSON.stringify(cdata)}`);
  }
  options.push('callback: function (token) { window.__tsToken = token; }');
  options.push("'error-callback': function (code) { window.__tsError = String(code); }");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>turnstile</title></head><body><div id="__ts_box" class="cf-turnstile" ${attributes.join(' ')}></div><script>window.__tsToken=null;window.__tsError=null;window.__tsLoad=function(){turnstile.render('#__ts_box',{${options.join(',')}});};</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tsLoad" async defer></script></body></html>`;
}

function outcomeResult(outcome: WidgetOutcome, options: SolveOptions, started: number, method: string, userAgent: string): ResolverResult {
  const detail = outcome.clicks > 0 ? `clicks=${outcome.clicks}` : null;
  if (outcome.token) {
    return resolverResult('cloudflare-turnstile', started, { solved: true, token: outcome.token, userAgent, method, detail });
  }
  if (outcome.error) {
    return resolverResult('cloudflare-turnstile', started, { userAgent, method, challenge: errorLabel(outcome.error), detail: outcome.error });
  }
  return resolverResult('cloudflare-turnstile', started, { userAgent, method, challenge: options.click === false ? 'token-timeout' : 'click-timeout', detail });
}

async function solveRouted(page: Page, url: string, sitekey: string, options: SolveOptions, started: number, userAgent: string): Promise<ResolverResult> {
  const pattern = url.replace(/[?#].*$/, '');
  const body = widgetHtml(sitekey, options.action, options.cdata);
  await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'text/html', body }));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 45000) }).catch(() => undefined);
    const outcome = await solveTurnstileWidget(page, options);
    return outcomeResult(outcome, options, started, 'route', userAgent);
  } finally {
    await page.unroute(pattern).catch(() => undefined);
  }
}

async function solveFreshPage(page: Page, url: string, options: SolveOptions, started: number, userAgent: string): Promise<ResolverResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const work = await page.context().newPage();
  try {
    await installSitekeyHook(work);
    await work.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 45000) }).catch((error: Error) => {
      logger.warn('captcha: turnstile navigation failed', error.message.split('\n')[0]);
    });

    const sitekey = options.sitekey ?? await waitForSitekey(work, Math.min(timeoutMs, 10000), intervalMs, options.signal);
    if (!sitekey) {
      return resolverResult('cloudflare-turnstile', started, { userAgent, method: 'widget', challenge: 'sitekey-missing' });
    }

    if (options.route !== false) {
      const routed = await solveRouted(work, url, sitekey, options, started, userAgent);
      if (routed.solved) return routed;
      if (routed.challenge && !routed.challenge.endsWith('timeout')) return routed;
    }

    await injectTurnstileWidget(work, sitekey, options);
    const outcome = await solveTurnstileWidget(work, options);
    return outcomeResult(outcome, options, started, 'widget', userAgent);
  } finally {
    await work.close().catch(() => undefined);
  }
}

async function detect(page: Page): Promise<boolean> {
  if (isTurnstile(await readPage(page))) return true;
  return (await grepSitekey(page)).length > 0;
}

async function solve(page: Page, options: SolveOptions = {}): Promise<ResolverResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const userAgent = await readUserAgent(page);
  const existing = await turnstileWidgetState(page);
  if (existing.token) {
    return resolverResult('cloudflare-turnstile', started, { solved: true, token: existing.token, cookies: await cookieHeader(page), userAgent, method: 'existing' });
  }

  if (options.url) return solveFreshPage(page, options.url, options, started, userAgent);

  const input = await readPage(page);
  const sitekey = options.sitekey ?? turnstileSitekey(input) ?? (await grepSitekey(page))[0]?.sitekey ?? null;
  if (!sitekey) {
    return resolverResult('cloudflare-turnstile', started, { userAgent, method: 'widget', challenge: 'sitekey-missing' });
  }

  const ctx = { ...options, timeoutMs };
  if (await isInterstitial(page)) {
    await injectTurnstileWidget(page, sitekey, options);
    const outcome = await solveTurnstileWidget(page, ctx);
    return outcomeResult(outcome, options, started, 'widget', userAgent);
  }

  for (let attempt = 0; attempt <= (options.retries ?? 0); attempt += 1) {
    if (attempt > 0) await sleep(Math.min(intervalMs * 4, 2000), options.signal);
    const outcome = await solveTurnstileWidget(page, ctx);
    if (outcome.token) {
      logger.info('captcha: turnstile token obtained', { attempt, clicks: outcome.clicks });
      return resolverResult('cloudflare-turnstile', started, { solved: true, token: outcome.token, cookies: await cookieHeader(page), userAgent, method: 'click', detail: `clicks=${outcome.clicks}` });
    }
    if (outcome.error) return outcomeResult(outcome, options, started, 'click', userAgent);
  }

  return resolverResult('cloudflare-turnstile', started, { userAgent, method: 'click', challenge: 'timeout' });
}

export const cloudflareTurnstile: Resolver = { kind: 'cloudflare-turnstile', detect, solve };
