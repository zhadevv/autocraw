import type { AutocrawConfig } from '../types';
import type { CaptchaKind } from '../resolver/shared';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

export const defaultConfig: AutocrawConfig = {
  userAgent: null,
  rotateUserAgent: false,
  timeoutMs: 30000,
  retries: 2,
  retryBaseDelayMs: 800,
  concurrency: 3,
  delayMs: 500,
  respectRobots: true,
  maxPages: 40,
  maxDepth: 2,
  maxBodyBytes: 8 * 1024 * 1024,
  sameOrigin: true,
  include: [],
  exclude: [],
  mode: 'auto',
  proxy: null,
  browserPath: null,
  sessionFile: null,
  headers: {},
  headless: true,
  stealth: true,
  blockResources: true,
  solveCaptcha: false,
  captchaKind: null,
  waitUntil: 'domcontentloaded',
  scroll: false,
  useSitemap: true,
  locale: 'en-US',
  verbose: false,
};
