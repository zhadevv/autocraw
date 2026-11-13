import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import {
  DEFAULT_TIMEOUT_MS,
  ensurePage,
  isRecaptchaEnterprise,
  poll,
  readPage,
  readUserAgent,
  recaptchaAnchor,
  recaptchaEnterpriseSitekey,
  recaptchaToken,
  resolverResult,
} from './shared';
import { solveRecaptchaBox } from './recaptcha-v2';
import type { Resolver, ResolverResult, SolveOptions } from './shared';

const SCRIPT_SOURCE = 'https://www.google.com/recaptcha/enterprise.js';
const DEFAULT_ACTION = 'verify';

async function detect(page: Page): Promise<boolean> {
  return isRecaptchaEnterprise(await readPage(page));
}

async function apiReady(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as unknown as { grecaptcha?: { enterprise?: { execute?: unknown } } }).grecaptcha?.enterprise?.execute)).catch(() => false);
}

async function ensureScript(page: Page, sitekey: string): Promise<boolean> {
  const present = await page.evaluate(({ source }) => {
    const holder = window as unknown as { grecaptcha?: { enterprise?: unknown } };
    return Boolean(holder.grecaptcha?.enterprise) || Boolean(document.querySelector(`script[src^="${source}"]`));
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
      grecaptcha?: { enterprise?: { ready?: (callback: () => void) => void; execute?: (sitekey: string, options?: { action?: string }) => Promise<string> } };
    };
    const api = holder.grecaptcha?.enterprise;
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
  if (existing) return resolverResult('recaptcha-enterprise', started, { solved: true, token: existing, userAgent, method: 'existing' });

  await ensurePage(page, options);

  const input = await readPage(page);
  const sitekey = options.sitekey ?? recaptchaEnterpriseSitekey(input);
  const action = options.action ?? DEFAULT_ACTION;

  const runner = async (target: Page, key: string): Promise<string | null> => {
    if (!(await ensureScript(target, key))) return null;
    return execute(target, key, action);
  };

  if (!recaptchaAnchor(page) && sitekey) {
    const token = await runner(page, sitekey);
    if (token) {
      logger.info('captcha: recaptcha enterprise token obtained', { action });
      return resolverResult('recaptcha-enterprise', started, { solved: true, token, userAgent, method: 'execute' });
    }
  }

  const budget = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return solveRecaptchaBox(page, { ...options, timeoutMs: budget }, started, 'recaptcha-enterprise', sitekey, runner);
}

export const recaptchaEnterprise: Resolver = { kind: 'recaptcha-enterprise', detect, solve };
