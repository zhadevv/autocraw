import { createHash } from 'node:crypto';
import type { Frame, Page } from 'playwright';
import { logger } from '../utils/logger';
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  cookieHeader,
  isPowblock,
  poll,
  readPage,
  readUserAgent,
  resolverResult,
  sleep,
} from './shared';
import type { Resolver, ResolverResult, SolveOptions } from './shared';

export interface PowChallenge {
  readonly token: string;
  readonly difficulty: number;
  readonly hash: 256 | 512;
}

export interface PowSolution {
  readonly nonce: number;
  readonly digest: string;
  readonly attempts: number;
}

export function leadingZeroBits(digest: Buffer): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

export function solvePowToken(token: string, difficulty: number, hash: 256 | 512, timeoutMs = 30000): PowSolution | null {
  const algorithm = hash === 512 ? 'sha512' : 'sha256';
  const deadline = Date.now() + timeoutMs;
  for (let nonce = 0; ; nonce += 1) {
    const digest = createHash(algorithm).update(token + String(nonce)).digest();
    if (leadingZeroBits(digest) >= difficulty) {
      return { nonce, digest: digest.toString('hex'), attempts: nonce + 1 };
    }
    if (nonce % 20000 === 0 && Date.now() >= deadline) return null;
  }
}

async function frameChallenge(frame: Frame): Promise<PowChallenge | null> {
  const data = await frame.evaluate(() => {
    const read = (id: string): string => (document.getElementById(id)?.textContent ?? '').trim();
    return {
      token: read('c'),
      difficulty: Number.parseInt(read('d'), 10),
      hash: Number.parseInt(read('h'), 10),
    };
  }).catch(() => null);
  if (!data || data.token.length < 20) return null;
  return {
    token: data.token,
    difficulty: Number.isFinite(data.difficulty) ? data.difficulty : 17,
    hash: data.hash === 512 ? 512 : 256,
  };
}

async function findChallenge(page: Page): Promise<{ frame: Frame; challenge: PowChallenge } | null> {
  for (const frame of page.frames()) {
    const challenge = await frameChallenge(frame);
    if (challenge) return { frame, challenge };
  }
  return null;
}

async function powToken(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies().catch(() => []);
  return cookies.find((cookie) => cookie.name === 'POW_TOKEN')?.value ?? null;
}

async function detect(page: Page): Promise<boolean> {
  if (isPowblock(await readPage(page))) return true;
  return (await findChallenge(page)) !== null;
}

async function solve(page: Page, options: SolveOptions = {}): Promise<ResolverResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const userAgent = await readUserAgent(page);
  let work = page;
  let owned = false;

  try {
    const existing = await powToken(page);
    if (existing && !isPowblock(await readPage(page))) {
      return resolverResult('powblock', started, { solved: true, token: existing, cookies: await cookieHeader(page), userAgent, method: 'cookie' });
    }

    if (options.url) {
      owned = true;
      work = await page.context().newPage();
      await work.goto(options.url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 45000) }).catch((error: Error) => {
        logger.warn('captcha: powblock navigation failed', error.message.split('\n')[0]);
      });
    }

    const found = await poll(() => findChallenge(work), Math.min(timeoutMs, 15000), intervalMs, options.signal);
    if (!found) {
      const cookie = await powToken(work);
      if (cookie) return resolverResult('powblock', started, { solved: true, token: cookie, cookies: await cookieHeader(work), userAgent, method: 'cookie' });
      return resolverResult('powblock', started, { userAgent, method: 'mining', challenge: 'challenge-missing' });
    }

    const { frame, challenge } = found;
    const remaining = timeoutMs - (Date.now() - started);
    const solution = solvePowToken(challenge.token, challenge.difficulty, challenge.hash, Math.max(1000, remaining));
    if (!solution) {
      return resolverResult('powblock', started, { userAgent, method: 'mining', challenge: 'pow-timeout', detail: `difficulty=${challenge.difficulty};hash=${challenge.hash}` });
    }

    logger.info('captcha: powblock solved', { difficulty: challenge.difficulty, hash: challenge.hash, attempts: solution.attempts });

    const url = new URL(frame.url() === 'about:blank' ? work.url() : frame.url());
    url.searchParams.delete('powblock');
    url.searchParams.delete('pbchal');
    url.searchParams.set('powblock', String(solution.nonce));
    url.searchParams.set('pbchal', challenge.token);

    if (frame === work.mainFrame()) await work.goto(url.toString(), { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    else await frame.goto(url.toString()).catch(() => undefined);

    const cookie = await poll(() => powToken(work), Math.max(1000, timeoutMs - (Date.now() - started)), intervalMs, options.signal);
    if (cookie) {
      logger.info('captcha: powblock token obtained');
      return resolverResult('powblock', started, {
        solved: true,
        token: cookie,
        cookies: await cookieHeader(work),
        userAgent,
        method: 'mining',
        detail: `difficulty=${challenge.difficulty};hash=${challenge.hash};nonce=${solution.nonce};attempts=${solution.attempts}`,
      });
    }

    return resolverResult('powblock', started, {
      userAgent,
      method: 'mining',
      challenge: 'token-missing',
      detail: `difficulty=${challenge.difficulty};hash=${challenge.hash};nonce=${solution.nonce}`,
    });
  } finally {
    if (owned) await work.close().catch(() => undefined);
  }
}

export const powblock: Resolver = { kind: 'powblock', detect, solve };
