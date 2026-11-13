import type { Frame, Page } from 'playwright';
import { logger } from '../utils/logger';
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  cookieHeader,
  frameRect,
  isAwsWaf,
  poll,
  readPage,
  readUserAgent,
  resolverResult,
  sleep,
} from './shared';
import type { Point, Rect, Resolver, ResolverResult, SolveOptions } from './shared';

const TOKEN_COOKIE = 'aws-waf-token';
const BLOCK_TITLE = /error: the request could not be satisfied|403 forbidden|access denied|request blocked/i;
const CAPTCHA_FRAME = /awswaf\.com|awswaf-captcha|captcha\.awswaf/i;

async function wafToken(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies().catch(() => []);
  return cookies.find((cookie) => cookie.name === TOKEN_COOKIE)?.value ?? null;
}

async function captchaFrame(page: Page): Promise<Frame | null> {
  return page.frames().find((frame) => frame !== page.mainFrame() && CAPTCHA_FRAME.test(frame.url())) ?? null;
}

async function frameCentre(frame: Frame): Promise<Point | null> {
  const box = await frameRect(frame);
  if (!box || box.width < 20 || box.height < 20) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function clickFrameCentre(page: Page, frame: Frame, signal?: AbortSignal): Promise<boolean> {
  const centre = await frameCentre(frame);
  if (!centre) return false;
  await page.mouse.click(centre.x, centre.y);
  await sleep(600 + Math.random() * 700, signal);
  return true;
}

async function sliderRect(frame: Frame): Promise<Rect | null> {
  return frame.evaluate(() => {
    const selectors = ['[class*="slider"]', '[role="slider"]', 'input[type="range"]', '[class*="handle"]'];
    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll(selector))) {
        const box = element.getBoundingClientRect();
        if (box.width < 24 || box.height < 8) continue;
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }
    }
    return null;
  }).catch(() => null);
}

async function dragFrameSlider(page: Page, frame: Frame, signal?: AbortSignal): Promise<boolean> {
  const slider = await sliderRect(frame);
  const box = await frameRect(frame);
  if (!slider || !box) return false;
  const from = { x: box.x + slider.x + 8, y: box.y + slider.y + slider.height / 2 };
  const to = { x: box.x + slider.x + slider.width - 4, y: from.y };
  await page.mouse.move(from.x, from.y);
  await sleep(120, signal);
  await page.mouse.down();
  const steps = 28;
  for (let index = 1; index <= steps; index += 1) {
    const x = from.x + ((to.x - from.x) * index) / steps + (Math.random() - 0.5) * 1.6;
    await page.mouse.move(x, from.y + (Math.random() - 0.5) * 1.4);
    await sleep(9 + Math.random() * 12, signal);
  }
  await sleep(180, signal);
  await page.mouse.up();
  return true;
}

async function detect(page: Page): Promise<boolean> {
  if ((await wafToken(page)) !== null && !BLOCK_TITLE.test(await page.title().catch(() => ''))) return true;
  return isAwsWaf(await readPage(page));
}

async function solve(page: Page, options: SolveOptions = {}): Promise<ResolverResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const userAgent = await readUserAgent(page);
  let work = page;
  let owned = false;

  try {
    const existing = await wafToken(page);
    if (existing && !isAwsWaf(await readPage(page))) {
      return resolverResult('aws-waf', started, {
        solved: true,
        token: existing,
        cookies: await cookieHeader(page),
        userAgent,
        method: 'cookie',
      });
    }

    if (options.url) {
      owned = true;
      work = await page.context().newPage();
      await work.goto(options.url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 45000) }).catch((error: Error) => {
        logger.warn('captcha: aws-waf navigation failed', error.message.split('\n')[0]);
      });
    }

    await sleep(600 + Math.random() * 800, options.signal);

    const immediate = await poll(() => wafToken(work), Math.min(timeoutMs, 12000), intervalMs, options.signal);
    if (immediate) {
      return resolverResult('aws-waf', started, {
        solved: true,
        token: immediate,
        cookies: await cookieHeader(work),
        userAgent,
        method: 'cookie',
      });
    }

    const title = await work.title().catch(() => '');
    if (BLOCK_TITLE.test(title)) {
      return resolverResult('aws-waf', started, { userAgent, method: 'cookie', challenge: 'ip-blocked', detail: title.slice(0, 200) });
    }

    const frame = await captchaFrame(work);
    if (frame) {
      await clickFrameCentre(work, frame, options.signal);
      let token = await poll(() => wafToken(work), Math.min(timeoutMs, 8000), intervalMs, options.signal);
      if (!token && (await dragFrameSlider(work, frame, options.signal))) {
        token = await poll(() => wafToken(work), Math.min(timeoutMs, 12000), intervalMs, options.signal);
      }
      if (!token) {
        await clickFrameCentre(work, frame, options.signal);
        token = await poll(() => wafToken(work), Math.min(timeoutMs, 8000), intervalMs, options.signal);
      }
      if (token) {
        logger.info('captcha: aws-waf token obtained after interaction');
        return resolverResult('aws-waf', started, {
          solved: true,
          token,
          cookies: await cookieHeader(work),
          userAgent,
          method: 'interaction',
        });
      }
      return resolverResult('aws-waf', started, { userAgent, method: 'interaction', challenge: 'token-missing', detail: frame.url().slice(0, 300) });
    }

    const late = await poll(() => wafToken(work), Math.max(1000, timeoutMs - (Date.now() - started)), intervalMs, options.signal);
    if (late) {
      return resolverResult('aws-waf', started, {
        solved: true,
        token: late,
        cookies: await cookieHeader(work),
        userAgent,
        method: 'cookie',
      });
    }

    return resolverResult('aws-waf', started, {
      userAgent,
      method: 'cookie',
      challenge: 'token-missing',
      detail: (await work.title().catch(() => '')).slice(0, 200),
    });
  } finally {
    if (owned) await work.close().catch(() => undefined);
  }
}

export const awsWaf: Resolver = { kind: 'aws-waf', detect, solve };
