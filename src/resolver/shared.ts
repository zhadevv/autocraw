import type { Frame, Page } from 'playwright';
import { sleep } from '../utils/sleep';

export { sleep };

export const CAPTCHA_KINDS = ['cloudflare-challenges', 'cloudflare-turnstile', 'recaptcha-v2', 'recaptcha-v3', 'recaptcha-enterprise', 'geetest', 'aws-waf', 'wobble', 'powblock'] as const;

export type CaptchaKind = (typeof CAPTCHA_KINDS)[number];

export type Transcriber = (audioUrl: string) => Promise<string | null>;

export interface DetectionInput {
  readonly html: string;
  readonly title: string;
  readonly frameUrls: readonly string[];
}

export interface SolveOptions {
  readonly sitekey?: string;
  readonly action?: string;
  readonly cdata?: string;
  readonly url?: string;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly route?: boolean;
  readonly click?: boolean;
  readonly retries?: number;
  readonly signal?: AbortSignal;
  readonly transcribe?: Transcriber;
}

export interface ResolverResult {
  readonly kind: CaptchaKind;
  readonly solved: boolean;
  readonly token: string | null;
  readonly cookies: string | null;
  readonly userAgent: string | null;
  readonly method: string;
  readonly challenge: string | null;
  readonly detail: string | null;
  readonly elapsedMs: number;
}

export interface Resolver {
  readonly kind: CaptchaKind;
  detect(page: Page): Promise<boolean>;
  solve(page: Page, options?: SolveOptions): Promise<ResolverResult>;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WidgetState {
  readonly token: string | null;
  readonly error: string | null;
}

export interface WidgetOutcome extends WidgetState {
  readonly clicks: number;
}

export const DEFAULT_TIMEOUT_MS = 45000;
export const DEFAULT_INTERVAL_MS = 250;

export const RECAPTCHA_ANCHOR_FRAME = /recaptcha\/(api2\/)?anchor/i;
export const RECAPTCHA_CHALLENGE_FRAME = /recaptcha\/(api2\/)?bframe/i;
export const RECAPTCHA_CHECKBOX = ['#recaptcha-anchor', '.recaptcha-checkbox-border', '.recaptcha-checkbox'];
export const RECAPTCHA_AUDIO_BUTTON = ['#recaptcha-audio-button'];
export const RECAPTCHA_VERIFY_BUTTON = ['#recaptcha-verify-button'];

const CHALLENGE_TITLE = /just a moment|attention required|checking your browser|verifying you are human|enable javascript and cookies/i;
const CHALLENGE_MARKERS = [
  /id=["']?challenge-form/i,
  /id=["']?cf-wrapper/i,
  /cf-browser-verification/i,
  /_cf_chl_opt|__cf_chl_/i,
];
const TURNSTILE_WIDGET = /<div[^>]*class=["'][^"']*\bcf-turnstile\b[^"']*["'][^>]*>/gi;
const RECAPTCHA_WIDGET = /<div[^>]*class=["'][^"']*\bg-recaptcha\b[^"']*["'][^>]*>/gi;
const SITEKEY_ATTRIBUTE = /data-sitekey=["']([^"']+)["']/i;
const RECAPTCHA_V3_RENDER = /recaptcha\/api\.js\?[^"']*render=([A-Za-z0-9_-]{10,})/i;
const RECAPTCHA_ENTERPRISE_RENDER = /recaptcha\/enterprise\.js\?[^"']*render=([A-Za-z0-9_-]{10,})/i;

function attribute(tag: string, pattern: RegExp): string | null {
  const match = pattern.exec(tag);
  return match?.[1] ?? null;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isCloudflareChallenge(input: DetectionInput): boolean {
  if (CHALLENGE_TITLE.test(input.title)) return true;
  const head = input.html.slice(0, 60000);
  return CHALLENGE_MARKERS.some((marker) => marker.test(head));
}

export function turnstileSitekey(input: DetectionInput): string | null {
  const head = input.html.slice(0, 200000);
  for (const tag of head.match(TURNSTILE_WIDGET) ?? []) {
    const sitekey = attribute(tag, SITEKEY_ATTRIBUTE);
    if (sitekey) return sitekey;
  }
  const iframe = /challenges\.cloudflare\.com[^"']*[?&]sitekey=([^&"']+)/i.exec(head);
  return iframe?.[1] ? decode(iframe[1]) : null;
}

export function isTurnstile(input: DetectionInput): boolean {
  return turnstileSitekey(input) !== null
    || /cf-turnstile-response/i.test(input.html)
    || input.frameUrls.some((url) => url.includes('challenges.cloudflare.com'));
}

export function recaptchaWidgetSitekey(input: DetectionInput): string | null {
  const head = input.html.slice(0, 200000);
  for (const tag of head.match(RECAPTCHA_WIDGET) ?? []) {
    const sitekey = attribute(tag, SITEKEY_ATTRIBUTE);
    if (sitekey) return sitekey;
  }
  return null;
}

export function recaptchaV3Sitekey(input: DetectionInput): string | null {
  const match = RECAPTCHA_V3_RENDER.exec(input.html.slice(0, 200000));
  return match?.[1] ?? null;
}

export function recaptchaEnterpriseSitekey(input: DetectionInput): string | null {
  const head = input.html.slice(0, 200000);
  const match = RECAPTCHA_ENTERPRISE_RENDER.exec(head);
  return match?.[1] ?? recaptchaWidgetSitekey(input);
}

export function isRecaptchaEnterprise(input: DetectionInput): boolean {
  return /recaptcha\/enterprise\.js|grecaptcha\.enterprise/i.test(input.html);
}

export function isRecaptchaV2(input: DetectionInput): boolean {
  const anchor = input.frameUrls.some((url) => RECAPTCHA_ANCHOR_FRAME.test(url));
  const widget = recaptchaWidgetSitekey(input) !== null;
  return (anchor || widget) && !isRecaptchaEnterprise(input);
}

export function isRecaptchaV3(input: DetectionInput): boolean {
  if (isRecaptchaV2(input) || isRecaptchaEnterprise(input)) return false;
  return recaptchaV3Sitekey(input) !== null || /grecaptcha\.execute\s*\(/i.test(input.html);
}

const GEETEST_MARKER = /static\.geetest\.com|gcaptcha4|initGeetest4?\s*\(|gt4\.js|geetest\.js/i;
const AWS_WAF_MARKER = /awswaf|\baws-waf-token\b/i;
const WOBBLE_MARKER = /wc-stage|wc-slider|wc-thumb|wobble-captcha|WobbleCaptcha/i;
const POWBLOCK_MARKER = /pbchal|pow_sol_|POWBlock/i;
const POWBLOCK_TOKEN = /id=["']?c["']?[^>]*>\s*[A-Za-z0-9+/=_-]{60,}/i;

export function isGeetest(input: DetectionInput): boolean {
  return GEETEST_MARKER.test(input.html.slice(0, 200000))
    || input.frameUrls.some((url) => /geetest\.com|gcaptcha4/i.test(url));
}

export function isAwsWaf(input: DetectionInput): boolean {
  return AWS_WAF_MARKER.test(input.html.slice(0, 200000))
    || input.frameUrls.some((url) => /awswaf\.com/i.test(url));
}

export function isWobble(input: DetectionInput): boolean {
  return WOBBLE_MARKER.test(input.html.slice(0, 200000));
}

export function isPowblock(input: DetectionInput): boolean {
  const head = input.html.slice(0, 200000);
  if (/POWBlock Check/i.test(input.title)) return true;
  if (POWBLOCK_TOKEN.test(head) && /id=["']?[dh]["']?/i.test(head)) return true;
  return POWBLOCK_MARKER.test(head) && /POW_TOKEN|powblock=/i.test(head);
}

export async function readPage(page: Page): Promise<DetectionInput> {
  const [html, title] = await Promise.all([page.content().catch(() => ''), page.title().catch(() => '')]);
  return { html, title, frameUrls: page.frames().map((frame) => frame.url()) };
}

export interface SitekeySource {
  readonly source: 'dom' | 'iframe' | 'hook' | 'html';
  readonly sitekey: string;
}

export async function installSitekeyHook(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const holder = window as unknown as { __cf_sitekeys?: string[]; turnstile?: { render?: (...args: unknown[]) => unknown } };
    holder.__cf_sitekeys = [];
    let current = holder.turnstile;
    try {
      Object.defineProperty(window, 'turnstile', {
        configurable: true,
        get: () => current,
        set: (value) => {
          if (value && typeof value.render === 'function') {
            const original = value.render;
            value.render = function (this: unknown, ...args: unknown[]) {
              const options = args[1] as { sitekey?: string } | undefined;
              if (options?.sitekey) holder.__cf_sitekeys?.push(options.sitekey);
              return original.apply(this, args);
            };
          }
          current = value;
        },
      });
    } catch {
      holder.__cf_sitekeys = holder.__cf_sitekeys ?? [];
    }
  });
}

export async function grepSitekey(page: Page): Promise<SitekeySource[]> {
  const sources: SitekeySource[] = [];

  const dom = await page.evaluate(() => {
    const element = document.querySelector('.cf-turnstile[data-sitekey], [data-sitekey]');
    return element?.getAttribute('data-sitekey') ?? null;
  }).catch(() => null);
  if (dom) sources.push({ source: 'dom', sitekey: dom });

  const iframe = await page.evaluate(() => {
    const element = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
    const match = element?.getAttribute('src')?.match(/[?&]sitekey=([^&]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }).catch(() => null);
  if (iframe) sources.push({ source: 'iframe', sitekey: iframe });

  const hook = await page.evaluate(() => {
    const keys = (window as unknown as { __cf_sitekeys?: string[] }).__cf_sitekeys ?? [];
    return keys[0] ?? null;
  }).catch(() => null);
  if (hook) sources.push({ source: 'hook', sitekey: hook });

  const html = await page.evaluate(() => {
    const markup = document.documentElement.outerHTML;
    const patterns = [/data-sitekey=["']([^"']+)["']/, /"sitekey"\s*:\s*"([^"]+)"/, /sitekey=([A-Za-z0-9_-]+)/];
    for (const pattern of patterns) {
      const match = pattern.exec(markup);
      if (match?.[1]) return match[1];
    }
    return null;
  }).catch(() => null);
  if (html && !sources.some((item) => item.sitekey === html)) sources.push({ source: 'html', sitekey: html });

  return sources;
}

export async function waitForSitekey(page: Page, timeoutMs = 5000, intervalMs = DEFAULT_INTERVAL_MS, signal?: AbortSignal): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [first] = await grepSitekey(page);
    if (first) return first.sitekey;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs, signal);
  }
}

export async function isInterstitial(page: Page): Promise<boolean> {
  const markers = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    const title = (document.title || '').toLowerCase();
    return Boolean(document.querySelector('#challenge-form, form#challenge-form'))
      || Boolean(document.querySelector('#cf-wrapper, .cf-browser-verification, #challenge-running'))
      || Boolean(document.querySelector('iframe[src*="challenges.cloudflare.com"]'))
      || /window\._cf_chl_opt|__cf_chl_/.test(html)
      || /just a moment|attention required|checking your browser|verifying you are human/.test(title);
  }).catch(() => false);
  return markers ?? false;
}

export async function poll<T>(read: () => Promise<T | null>, timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = DEFAULT_INTERVAL_MS, signal?: AbortSignal): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read().catch(() => null);
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs, signal);
  }
}

export async function inputValue(page: Page, selector: string): Promise<string | null> {
  const value = await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) return null;
    return 'value' in element ? String((element as HTMLInputElement | HTMLTextAreaElement).value) : null;
  }, selector).catch(() => null);
  return value && value.length > 0 ? value : null;
}

export async function readUserAgent(page: Page): Promise<string> {
  return page.evaluate(() => navigator.userAgent).catch(() => '');
}

export async function cookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies().catch(() => []);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export async function clearanceCookie(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies(page.url()).catch(() => []);
  return cookies.find((cookie) => cookie.name === 'cf_clearance')?.value ?? null;
}

export async function waitForClearance(page: Page, timeoutMs = 60000, intervalMs = 500, signal?: AbortSignal): Promise<string | null> {
  return poll(() => clearanceCookie(page), timeoutMs, intervalMs, signal);
}

export async function ensurePage(page: Page, options: SolveOptions): Promise<void> {
  if (!options.url) return;
  const current = page.url();
  if (current === options.url || (current !== 'about:blank' && current.startsWith(options.url))) return;
  await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 45000) }).catch(() => undefined);
}

export function humanPath(from: Point, to: Point, steps = 18): Point[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const offset = Math.max(4, distance * 0.25);
  const controlX = (from.x + to.x) / 2 + (Math.random() - 0.5) * offset;
  const controlY = (from.y + to.y) / 2 + (Math.random() - 0.5) * offset;
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * controlX + t ** 2 * to.x;
    const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * controlY + t ** 2 * to.y;
    points.push({ x: Math.round(x + (Math.random() - 0.5) * 0.6), y: Math.round(y + (Math.random() - 0.5) * 0.6) });
  }
  return points;
}

export async function clickLikeHuman(page: Page, target: Point, signal?: AbortSignal): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const start = { x: 40 + Math.random() * (viewport.width - 80), y: 40 + Math.random() * (viewport.height - 80) };
  for (const point of humanPath(start, target)) {
    await page.mouse.move(point.x, point.y);
    await sleep(6 + Math.random() * 16, signal);
  }
  await page.mouse.click(target.x, target.y);
}

export interface DragScanOutcome {
  readonly x: number;
  readonly distance: number;
  readonly samples: number;
}

export async function dragScan(page: Page, from: Point, to: Point, read: () => Promise<Point | null>, target: Point, signal?: AbortSignal): Promise<DragScanOutcome> {
  await page.mouse.move(from.x, from.y);
  await sleep(70 + Math.random() * 90, signal);
  await page.mouse.down();
  const span = to.x - from.x;
  const steps = Math.max(14, Math.round(Math.abs(span) / 4));
  let bestX = from.x;
  let distance = Number.POSITIVE_INFINITY;

  const sample = async (x: number): Promise<void> => {
    await page.mouse.move(x, from.y + (Math.random() - 0.5) * 2);
    const point = await read();
    if (!point) return;
    const value = Math.hypot(point.x - target.x, point.y - target.y);
    if (value < distance) {
      distance = value;
      bestX = x;
    }
  };

  for (let index = 1; index <= steps; index += 1) {
    const x = from.x + span * (index / steps) + (Math.random() - 0.5) * 2.4;
    await sample(x);
    const pause = Math.random() < 0.08 ? 40 + Math.random() * 60 : 8 + Math.random() * 15;
    await sleep(pause, signal);
  }

  for (let offset = -12; offset <= 12; offset += 2) {
    await sample(bestX + offset);
    await sleep(9 + Math.random() * 9, signal);
  }

  await page.mouse.move(bestX, from.y);
  await sleep(150 + Math.random() * 170, signal);
  await page.mouse.up();
  return { x: bestX, distance, samples: steps };
}

export async function frameRect(frame: Frame): Promise<Rect | null> {
  const element = await frame.frameElement().catch(() => null);
  const box = element ? await element.boundingBox().catch(() => null) : null;
  return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
}

export async function clickInFrame(page: Page, frame: Frame, selectors: readonly string[], signal?: AbortSignal): Promise<boolean> {
  const iframeBox = await frameRect(frame);
  if (!iframeBox) return false;
  for (const selector of selectors) {
    const element = await frame.$(selector).catch(() => null);
    const box = element ? await element.boundingBox().catch(() => null) : null;
    if (!box) continue;
    await clickLikeHuman(page, { x: iframeBox.x + box.x + box.width / 2, y: iframeBox.y + box.y + box.height / 2 }, signal);
    return true;
  }
  return false;
}

export async function clickTurnstile(page: Page, signal?: AbortSignal): Promise<boolean> {
  const rect = await page.evaluate(() => {
    const holder = window as unknown as { __tsShadowRoot?: ShadowRoot };
    const box = document.querySelector('#__ts_box');
    const iframe = box?.querySelector('iframe')
      ?? holder.__tsShadowRoot?.querySelector('iframe')
      ?? document.querySelector('iframe[src*="challenges.cloudflare.com"]');
    if (!iframe) return null;
    const bounds = iframe.getBoundingClientRect();
    if (bounds.width < 20 || bounds.height < 10) return null;
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }).catch(() => null);

  if (rect) {
    await clickLikeHuman(page, { x: rect.x + 28 + (Math.random() * 6 - 3), y: rect.y + rect.height / 2 + (Math.random() * 6 - 3) }, signal);
    return true;
  }

  for (const frame of page.frames()) {
    if (!frame.url().includes('challenges.cloudflare.com')) continue;
    const box = await frameRect(frame);
    if (!box || box.width < 20) continue;
    await clickLikeHuman(page, { x: box.x + 28, y: box.y + box.height / 2 }, signal);
    return true;
  }

  const widget = await page.$('.cf-turnstile, [data-sitekey]').catch(() => null);
  const box = widget ? await widget.boundingBox().catch(() => null) : null;
  if (!box) return false;
  await clickLikeHuman(page, { x: box.x + 28, y: box.y + box.height / 2 }, signal);
  return true;
}

export async function injectTurnstileWidget(page: Page, sitekey: string, options: SolveOptions = {}): Promise<void> {
  await page.evaluate(({ key, action, cdata }) => {
    window.stop();
    const holder = window as unknown as {
      __tsToken?: string | null;
      __tsError?: string | null;
      __tsShadowRoot?: ShadowRoot;
      turnstile?: { render: (target: string, options: Record<string, unknown>) => void };
    };
    holder.__tsToken = null;
    holder.__tsError = null;
    const originalAttach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init: ShadowRootInit) {
      const root = originalAttach.call(this, { ...init, mode: 'open' });
      holder.__tsShadowRoot = root;
      return root;
    };
    const body = document.body ?? document.documentElement;
    body.replaceChildren();
    const box = document.createElement('div');
    box.id = '__ts_box';
    box.style.cssText = 'position:fixed;top:20px;left:20px;z-index:2147483647';
    body.appendChild(box);
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const settings: Record<string, unknown> = {
        sitekey: key,
        callback: (token: string) => { holder.__tsToken = token; },
        'error-callback': (code: string | number) => { holder.__tsError = String(code); },
      };
      if (action) settings.action = action;
      if (cdata) settings.cdata = cdata;
      holder.turnstile?.render('#__ts_box', settings);
    };
    (document.head ?? document.documentElement).appendChild(script);
  }, { key: sitekey, action: options.action, cdata: options.cdata });
}

export async function turnstileWidgetState(page: Page): Promise<WidgetState> {
  return page.evaluate(() => {
    const holder = window as unknown as {
      __tsToken?: string | null;
      __tsError?: string | null;
      turnstile?: { getResponse?: (target?: string) => string | undefined };
    };
    if (holder.__tsToken) return { token: holder.__tsToken, error: null };
    const box = document.querySelector('#__ts_box');
    const input = (box?.querySelector('input[name="cf-turnstile-response"]')
      ?? document.querySelector('input[name="cf-turnstile-response"]')) as HTMLInputElement | null;
    if (input?.value) return { token: input.value, error: null };
    const api = holder.turnstile;
    if (api?.getResponse) {
      for (const target of ['#__ts_box', undefined]) {
        try {
          const response = api.getResponse(target);
          if (response) return { token: response, error: null };
        } catch {
          continue;
        }
      }
    }
    return { token: null, error: holder.__tsError ? String(holder.__tsError) : null };
  }).catch(() => ({ token: null, error: null }));
}

export async function solveTurnstileWidget(page: Page, options: SolveOptions = {}): Promise<WidgetOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? 300;
  const deadline = Date.now() + timeoutMs;
  let clicks = 0;
  let lastClick = 0;

  for (;;) {
    const state = await turnstileWidgetState(page);
    if (state.token) return { ...state, clicks };
    if (state.error) return { ...state, clicks };
    const canClick = options.click !== false && clicks < 4 && Date.now() - lastClick >= 6000;
    if (canClick && await clickTurnstile(page, options.signal)) {
      clicks += 1;
      lastClick = Date.now();
    }
    if (Date.now() >= deadline) return { token: null, error: null, clicks };
    await sleep(intervalMs, options.signal);
  }
}

export function recaptchaAnchor(page: Page): Frame | null {
  return page.frames().find((frame) => RECAPTCHA_ANCHOR_FRAME.test(frame.url()) || frame.name().startsWith('a-')) ?? null;
}

export function recaptchaChallenge(page: Page): Frame | null {
  return page.frames().find((frame) => RECAPTCHA_CHALLENGE_FRAME.test(frame.url()) || frame.name().startsWith('c-')) ?? null;
}

export async function recaptchaChecked(page: Page): Promise<boolean> {
  const frame = recaptchaAnchor(page);
  if (!frame) return false;
  return frame.evaluate(() => {
    const anchor = document.querySelector('#recaptcha-anchor');
    return anchor?.getAttribute('aria-checked') === 'true'
      || Boolean(document.querySelector('#recaptcha-anchor.recaptcha-checkbox-checked, .recaptcha-checkbox-checked'));
  }).catch(() => false);
}

export async function recaptchaToken(page: Page): Promise<string | null> {
  return inputValue(page, 'textarea[name="g-recaptcha-response"], #g-recaptcha-response, .g-recaptcha-response');
}

export async function recaptchaWaitToken(page: Page, timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = DEFAULT_INTERVAL_MS, signal?: AbortSignal): Promise<string | null> {
  return poll(() => recaptchaToken(page), timeoutMs, intervalMs, signal);
}

export async function recaptchaAudioUrl(page: Page): Promise<string | null> {
  const frame = recaptchaChallenge(page);
  if (!frame) return null;
  return frame.evaluate(() => {
    const link = document.querySelector('.rc-audiochallenge-tdownload-link') as HTMLAnchorElement | null;
    if (link?.href) return link.href;
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    return audio?.src || null;
  }).catch(() => null) ?? null;
}

export async function recaptchaIpBlocked(page: Page): Promise<boolean> {
  const frame = recaptchaChallenge(page) ?? recaptchaAnchor(page);
  if (!frame) return false;
  return frame.evaluate(() => /rc-doscaptcha-header|sending automated queries/i.test(document.body?.innerText ?? '')).catch(() => false);
}

export async function recaptchaSubmitAudio(page: Page, answer: string, signal?: AbortSignal): Promise<boolean> {
  const frame = recaptchaChallenge(page);
  if (!frame) return false;
  const field = await frame.$('#audio-response').catch(() => null);
  if (!field) return false;
  await field.fill(answer).catch(() => undefined);
  return clickInFrame(page, frame, RECAPTCHA_VERIFY_BUTTON, signal);
}

export function resolverResult(kind: CaptchaKind, started: number, fields: {
  solved?: boolean;
  token?: string | null;
  cookies?: string | null;
  userAgent?: string | null;
  method?: string;
  challenge?: string | null;
  detail?: string | null;
} = {}): ResolverResult {
  return {
    kind,
    solved: fields.solved ?? false,
    token: fields.token ?? null,
    cookies: fields.cookies ?? null,
    userAgent: fields.userAgent ?? null,
    method: fields.method ?? 'none',
    challenge: fields.challenge ?? null,
    detail: fields.detail ?? null,
    elapsedMs: Date.now() - started,
  };
}
