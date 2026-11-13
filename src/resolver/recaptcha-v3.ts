import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  ensurePage,
  isRecaptchaV3,
  poll,
  readPage,
  readUserAgent,
  recaptchaToken,
  recaptchaV3Sitekey,
  recaptchaWaitToken,
  resolverResult,
  sleep,
} from './shared';
import type { Resolver, ResolverResult, SolveOptions } from './shared';

const SCRIPT_SOURCE = 'https://www.google.com/recaptcha/api.js';
const DEFAULT_ACTION = 'verify';

async function detect(page: Page): Promise<boolean> {
  return isRecaptchaV3(await readPage(page));
}

async function apiReady(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as unknown as { grecaptcha?: { execute?: unknown } }).grecaptcha?.execute)).catch(() => false);
}

async function ensureScript(page: Page, sitekey: string): Promise<boolean> {
  const present = await page.evaluate(({ source }) => {
    const holder = window as unknown as { grecaptcha?: unknown };
    return Boolean(holder.grecaptcha) || Boolean(document.querySelector(`script[src^="${source}"]`));
  }, { source: SCRIPT_SOURCE }).catch(() => false);

  if (!present) {
    await page.evaluate(({ source, key }) => {
      const script = document.createElement('script');
      script.src = `${source}?render=${encodeURIComponent(key)}`;
      script.async = true;
      document.head.appendChild(script);
    }, { source: SCRIPT_SOURCE, key: sitekey }).catch(() => undefined);
  }

  return await poll(async () => (await apiReady(page)) ? 'ready' : null, 10000, 200) !== null;
}

async function execute(page: Page, sitekey: string, action: string): Promise<string | null> {
  return page.evaluate(async ({ key, value }) => {
    const holder = window as unknown as {
      grecaptcha?: { ready?: (callback: () => void) => void; execute?: (sitekey: string, options?: { action?: string }) => Promise<string> };
    };
    const api = holder.grecaptcha;
    if (!api?.execute) return null;
    await new Promise<void>((resolve) => {
      if (api.ready) api.ready(() => resolve());
      else resolve();
    });
    try {
      return await api.execute(key, { action: value });
    } catch {
      return null;
    }
  }, { key: sitekey, value: action }).catch(() => null);
}

async function solve(page: Page, options: SolveOptions = {}): Promise<ResolverResult> {
  const started = Date.now();
  const userAgent = await readUserAgent(page);
  const existing = await recaptchaToken(page);
  if (existing) return resolverResult('recaptcha-v3', started, { solved: true, token: existing, userAgent, method: 'existing' });

  await ensurePage(page, options);

  const input = await readPage(page);
  const sitekey = options.sitekey ?? recaptchaV3Sitekey(input);
  if (!sitekey) return resolverResult('recaptcha-v3', started, { userAgent, method: 'execute', challenge: 'sitekey-missing' });

  if (!(await ensureScript(page, sitekey))) {
    return resolverResult('recaptcha-v3', started, { userAgent, method: 'execute', challenge: 'script-unavailable' });
  }

  const action = options.action ?? DEFAULT_ACTION;
  const retries = Math.max(0, options.retries ?? 1);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const token = await execute(page, sitekey, action);
    if (token) {
      logger.info('captcha: recaptcha v3 token obtained', { attempt, action });
      return resolverResult('recaptcha-v3', started, { solved: true, token, userAgent, method: 'execute', detail: `attempt=${attempt + 1}` });
    }

    const polled = await recaptchaWaitToken(page, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 5000), options.intervalMs ?? DEFAULT_INTERVAL_MS, options.signal);
    if (polled) return resolverResult('recaptcha-v3', started, { solved: true, token: polled, userAgent, method: 'harvest', detail: `attempt=${attempt + 1}` });

    await sleep(Math.min(options.intervalMs ?? DEFAULT_INTERVAL_MS, 500), options.signal);
  }

  return resolverResult('recaptcha-v3', started, { userAgent, method: 'execute', challenge: 'execute-failed' });
}

export const recaptchaV3: Resolver = { kind: 'recaptcha-v3', detect, solve };
