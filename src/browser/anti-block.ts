import type { AutocrawConfig } from '../types';
import { DEFAULT_USER_AGENT } from '../config/defaults';

export const USER_AGENTS: string[] = [
  DEFAULT_USER_AGENT,
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
];

export function pickUserAgent(config: Pick<AutocrawConfig, 'userAgent' | 'rotateUserAgent'>): string {
  if (config.userAgent) return config.userAgent;
  if (config.rotateUserAgent) return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? DEFAULT_USER_AGENT;
  return DEFAULT_USER_AGENT;
}

export function browserHeaders(userAgent: string, locale: string): Record<string, string> {
  const language = locale.includes('-') ? `${locale},${locale.split('-')[0]};q=0.9` : `${locale};q=0.9`;
  const headers: Record<string, string> = {
    'user-agent': userAgent,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': language,
    'accept-encoding': 'gzip, deflate, br',
    'upgrade-insecure-requests': '1',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'cache-control': 'max-age=0',
  };
  if (/Chrome\/(\d+)/.test(userAgent)) {
    const major = /Chrome\/(\d+)/.exec(userAgent)?.[1] ?? '139';
    headers['sec-ch-ua'] = `"Chromium";v="${major}", "Google Chrome";v="${major}", "Not.A/Brand";v="99"`;
    headers['sec-ch-ua-mobile'] = '?0';
    headers['sec-ch-ua-platform'] = /Windows/.test(userAgent) ? '"Windows"' : /Macintosh/.test(userAgent) ? '"macOS"' : '"Linux"';
  }
  return headers;
}

export interface BlockVerdict {
  blocked: boolean;
  reason: string | null;
}

const challengeMarkers: Array<{ test: RegExp; reason: string }> = [
  { test: /cf-turnstile|challenges\.cloudflare\.com\/turnstile|turnstile\/v0/i, reason: 'cloudflare-turnstile' },
  { test: /<title>\s*just a moment\.\.\.\s*<\/title>/i, reason: 'cloudflare-js-challenge' },
  { test: /cf-browser-verification|cf_chl_opt|challenge-platform|cf-turnstile/i, reason: 'cloudflare-challenge' },
  { test: /<title>\s*attention required!?\s*\|\s*cloudflare/i, reason: 'cloudflare-block' },
  { test: /ddos-guard|__ddg_|ddos protection by/i, reason: 'ddos-guard' },
  { test: /sucuri website firewall|cloudproxy@sucuri/i, reason: 'sucuri-waf' },
  { test: /<title>\s*access denied\s*<\/title>/i, reason: 'access-denied' },
  { test: /g-recaptcha|hcaptcha\.com\/1\/api|captcha-delivery\.com/i, reason: 'captcha' },
  { test: /enable javascript and cookies to continue/i, reason: 'js-required-challenge' },
  { test: /perimeterx|px-captcha|_pxhd/i, reason: 'perimeterx' },
];

export function detectBlock(status: number, headers: Record<string, string>, body: string): BlockVerdict {
  if (headers['cf-mitigated'] === 'challenge') return { blocked: true, reason: /cf-turnstile|challenges\.cloudflare\.com\/turnstile/i.test(body.slice(0, 80000)) ? 'cloudflare-turnstile' : 'cloudflare-mitigated' };
  const head = body.slice(0, 60000);
  const suspicious = status === 403 || status === 429 || status === 503 || status === 401 || status === 406;
  if (suspicious) {
    for (const marker of challengeMarkers) {
      if (marker.test.test(head)) return { blocked: true, reason: marker.reason };
    }
    if (status === 429) return { blocked: true, reason: 'rate-limited' };
    if (status === 403 && head.length < 2000) return { blocked: true, reason: 'forbidden' };
    return { blocked: false, reason: null };
  }
  if (status === 200 && head.length < 40000) {
    for (const marker of challengeMarkers.filter((item) => item.reason === 'cloudflare-turnstile' || item.reason === 'cloudflare-js-challenge' || item.reason === 'cloudflare-challenge')) {
      if (marker.test.test(head)) return { blocked: true, reason: marker.reason };
    }
  }
  return { blocked: false, reason: null };
}

export function stealthInitScript(locale: string): string {
  const languages = JSON.stringify(locale.includes('-') ? [locale, locale.split('-')[0]] : [locale]);
  return `
(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'languages', { get: () => ${languages} });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
      ]
    });
  } catch (e) {}
  try {
    if (!window.chrome) {
      window.chrome = { runtime: {}, app: { isInstalled: false }, csi: () => ({}), loadTimes: () => ({}) };
    }
  } catch (e) {}
  try {
    const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) =>
        parameters && parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery.call(window.navigator.permissions, parameters);
    }
  } catch (e) {}
  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, parameter);
    };
  } catch (e) {}
})();
`;
}

const INTERACTIVE = new Set(['cloudflare-turnstile', 'cloudflare-mitigated', 'captcha', 'perimeterx']);

export function needsHuman(reason: unknown): boolean {
  return typeof reason === 'string' && INTERACTIVE.has(reason);
}
