import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import {
  clearanceCookie,
  clickTurnstile,
  cookieHeader,
  grepSitekey,
  installSitekeyHook,
  isInterstitial,
  readUserAgent,
  resolverResult,
  sleep,
} from './shared';
import type { Resolver, ResolverResult, SolveOptions } from './shared';

const CLICK_INTERVAL_MS = 4000;
const MAX_CLICKS = 8;
const PROBE_INTERVAL_MS = 2000;

async function detect(page: Page): Promise<boolean> {
  return isInterstitial(page);
}

async function solve(page: Page, options: SolveOptions = {}): Promise<ResolverResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 60000;
  const intervalMs = options.intervalMs ?? 500;
  const retries = Math.max(0, options.retries ?? 1);
  const userAgent = await readUserAgent(page);
  let work = page;
  let owned = false;

  if (options.url) {
    owned = true;
    work = await page.context().newPage();
    await installSitekeyHook(work);
    await work.goto(options.url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 45000) }).catch((error: Error) => {
      logger.warn('captcha: challenge navigation failed', error.message.split('\n')[0]);
    });
  }

  try {
    const sources = await grepSitekey(work);
    const sitekey = options.sitekey ?? sources[0]?.sitekey ?? null;
    if (sitekey) logger.info('captcha: challenge sitekey found', sitekey);

    const attemptTimeout = Math.max(5000, Math.ceil(timeoutMs / (retries + 1)));
    let clicks = 0;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) {
        logger.info('captcha: reloading challenge', { attempt });
        await work.reload({ waitUntil: 'domcontentloaded', timeout: Math.min(attemptTimeout, 30000) }).catch(() => undefined);
      }

      const deadline = Date.now() + attemptTimeout;
      let lastClick = 0;
      let lastProbe = 0;

      while (Date.now() < deadline) {
        const clearance = await clearanceCookie(work);
        if (clearance) {
          logger.info('captcha: cf_clearance obtained', { attempt, clicks });
          return resolverResult('cloudflare-challenges', started, { solved: true, token: clearance, cookies: await cookieHeader(page), userAgent, method: 'clearance', detail: `clicks=${clicks}` });
        }

        const now = Date.now();
        if (now - lastProbe >= PROBE_INTERVAL_MS) {
          lastProbe = now;
          if (!(await isInterstitial(work))) {
            return resolverResult('cloudflare-challenges', started, { solved: true, cookies: await cookieHeader(page), userAgent, method: 'interstitial-cleared', detail: `clicks=${clicks}` });
          }
        }

        if (options.click !== false && clicks < MAX_CLICKS && now - lastClick >= CLICK_INTERVAL_MS) {
          if (await clickTurnstile(work, options.signal)) {
            clicks += 1;
            lastClick = now;
          }
        }

        await sleep(intervalMs, options.signal);
      }
    }

    return resolverResult('cloudflare-challenges', started, { cookies: await cookieHeader(page), userAgent, method: 'clearance', challenge: 'timeout', detail: `clicks=${clicks}` });
  } finally {
    if (owned) await work.close().catch(() => undefined);
  }
}

export const cloudflareChallenges: Resolver = { kind: 'cloudflare-challenges', detect, solve };
