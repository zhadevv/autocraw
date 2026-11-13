import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  RECAPTCHA_AUDIO_BUTTON,
  RECAPTCHA_CHECKBOX,
  clickInFrame,
  ensurePage,
  isRecaptchaV2,
  poll,
  readPage,
  readUserAgent,
  recaptchaAnchor,
  recaptchaAudioUrl,
  recaptchaChallenge,
  recaptchaChecked,
  recaptchaIpBlocked,
  recaptchaSubmitAudio,
  recaptchaToken,
  recaptchaWaitToken,
  recaptchaWidgetSitekey,
  resolverResult,
  sleep,
} from './shared';
import type { CaptchaKind, Resolver, ResolverResult, SolveOptions } from './shared';

type InvisibleRunner = (page: Page, sitekey: string) => Promise<string | null>;

const ANCHOR_TIMEOUT_MS = 12000;
const CHECK_TIMEOUT_MS = 5000;
const AUDIO_TIMEOUT_MS = 15000;

async function executeInvisible(page: Page, sitekey: string): Promise<string | null> {
  return page.evaluate(async (key) => {
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
      return await api.execute(key);
    } catch {
      return null;
    }
  }, sitekey).catch(() => null);
}

export async function solveRecaptchaBox(page: Page, options: SolveOptions, started: number, kind: CaptchaKind, sitekey: string | null, invisible?: InvisibleRunner): Promise<ResolverResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const signal = options.signal;
  const userAgent = await readUserAgent(page);

  const anchor = await poll(() => Promise.resolve(recaptchaAnchor(page)), Math.min(timeoutMs, ANCHOR_TIMEOUT_MS), intervalMs, signal);

  if (anchor && options.click !== false) {
    await clickInFrame(page, anchor, RECAPTCHA_CHECKBOX, signal);
  } else if (!anchor && sitekey && invisible) {
    const token = await invisible(page, sitekey);
    if (token) return resolverResult(kind, started, { solved: true, token, userAgent, method: 'execute' });
  }

  const checkDeadline = Date.now() + Math.min(timeoutMs, CHECK_TIMEOUT_MS);
  let token: string | null = null;
  let checked = false;
  while (Date.now() < checkDeadline) {
    token = await recaptchaToken(page);
    if (token) break;
    checked = await recaptchaChecked(page);
    if (checked) break;
    await sleep(intervalMs, signal);
  }

  if (token) return resolverResult(kind, started, { solved: true, token, userAgent, method: options.click === false ? 'execute' : 'click' });

  if (checked) {
    token = await recaptchaWaitToken(page, CHECK_TIMEOUT_MS, intervalMs, signal);
    if (token) return resolverResult(kind, started, { solved: true, token, userAgent, method: 'click' });
  }

  if (await recaptchaIpBlocked(page)) {
    return resolverResult(kind, started, { userAgent, method: 'click', challenge: 'ip-blocked' });
  }

  const challenge = recaptchaChallenge(page);
  if (challenge) {
    logger.info('captcha: recaptcha challenge frame detected', { kind });
    await clickInFrame(page, challenge, RECAPTCHA_AUDIO_BUTTON, signal);
    const audioUrl = await poll(() => recaptchaAudioUrl(page), Math.min(timeoutMs, AUDIO_TIMEOUT_MS), intervalMs, signal);

    if (!audioUrl) {
      return resolverResult(kind, started, { userAgent, method: 'audio', challenge: 'audio-unavailable' });
    }

    if (!options.transcribe) {
      return resolverResult(kind, started, { userAgent, method: 'audio', challenge: 'audio-required', detail: audioUrl });
    }

    let currentUrl = audioUrl;
    for (let attempt = 0; attempt <= (options.retries ?? 1); attempt += 1) {
      const answer = await options.transcribe(currentUrl).catch(() => null);
      if (!answer) break;
      await recaptchaSubmitAudio(page, answer, signal);
      token = await recaptchaWaitToken(page, Math.min(timeoutMs, 10000), intervalMs, signal);
      if (token) return resolverResult(kind, started, { solved: true, token, userAgent, method: 'audio', detail: `attempt=${attempt + 1}` });
      if (await recaptchaChecked(page)) {
        token = await recaptchaWaitToken(page, CHECK_TIMEOUT_MS, intervalMs, signal);
        if (token) return resolverResult(kind, started, { solved: true, token, userAgent, method: 'audio', detail: `attempt=${attempt + 1}` });
      }
      const next = await recaptchaAudioUrl(page);
      if (next) currentUrl = next;
    }

    return resolverResult(kind, started, { userAgent, method: 'audio', challenge: 'audio-rejected' });
  }

  token = await recaptchaWaitToken(page, Math.min(timeoutMs, 8000), intervalMs, signal);
  if (token) return resolverResult(kind, started, { solved: true, token, userAgent, method: options.click === false ? 'execute' : 'click' });

  return resolverResult(kind, started, { userAgent, method: anchor ? 'click' : 'execute', challenge: 'not-solved' });
}

async function detect(page: Page): Promise<boolean> {
  return isRecaptchaV2(await readPage(page));
}

async function solve(page: Page, options: SolveOptions = {}): Promise<ResolverResult> {
  const started = Date.now();
  const userAgent = await readUserAgent(page);
  const existing = await recaptchaToken(page);
  if (existing) return resolverResult('recaptcha-v2', started, { solved: true, token: existing, userAgent, method: 'existing' });

  await ensurePage(page, options);

  const input = await readPage(page);
  const sitekey = options.sitekey ?? recaptchaWidgetSitekey(input);
  return solveRecaptchaBox(page, options, started, 'recaptcha-v2', sitekey, executeInvisible);
}

export const recaptchaV2: Resolver = { kind: 'recaptcha-v2', detect, solve };
