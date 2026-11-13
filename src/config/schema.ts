import { z } from 'zod';
import { defaultConfig } from './defaults';
import { AutocrawError } from '../utils/errors';
import { resolveBrowserExecutable } from '../utils/paths';
import type { AutocrawConfig, AutocrawConfigInput } from '../types';
import { CAPTCHA_KINDS } from '../resolver/shared';

const regexSource = z.string().refine(
  (value: string) => {
    try {
      new RegExp(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'must be a valid regular expression' },
);

export const configSchema = z.object({
  userAgent: z.string().min(1).nullable(),
  rotateUserAgent: z.boolean(),
  timeoutMs: z.number().int().min(1000).max(300000),
  retries: z.number().int().min(0).max(10),
  retryBaseDelayMs: z.number().int().min(0).max(60000),
  concurrency: z.number().int().min(1).max(64),
  delayMs: z.number().int().min(0).max(60000),
  respectRobots: z.boolean(),
  maxPages: z.number().int().min(1).max(100000),
  maxDepth: z.number().int().min(0).max(20),
  maxBodyBytes: z.number().int().min(1024).max(256 * 1024 * 1024),
  sameOrigin: z.boolean(),
  include: z.array(regexSource),
  exclude: z.array(regexSource),
  mode: z.enum(['http', 'browser', 'auto']),
  proxy: z.string().min(1).nullable(),
  browserPath: z.string().min(1).nullable(),
  sessionFile: z.string().min(1).nullable(),
  headers: z.record(z.string(), z.string()),
  headless: z.boolean(),
  stealth: z.boolean(),
  blockResources: z.boolean(),
  solveCaptcha: z.boolean(),
  captchaKind: z.enum(CAPTCHA_KINDS).nullable(),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']),
  scroll: z.boolean(),
  useSitemap: z.boolean(),
  locale: z.string().min(2),
  verbose: z.boolean(),
});

export function resolveConfig(input: AutocrawConfigInput = {}): AutocrawConfig {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) cleaned[key] = value;
  }
  const env = process.env;
  const merged: Record<string, unknown> = { ...defaultConfig, ...cleaned };
  if (cleaned.browserPath === undefined && env.AUTOCRAW_BROWSER_PATH && env.AUTOCRAW_BROWSER_PATH.trim()) merged.browserPath = env.AUTOCRAW_BROWSER_PATH.trim();
  if (cleaned.sessionFile === undefined && env.AUTOCRAW_SESSION_FILE && env.AUTOCRAW_SESSION_FILE.trim()) merged.sessionFile = env.AUTOCRAW_SESSION_FILE.trim();
  if (cleaned.proxy === undefined && env.AUTOCRAW_PROXY && env.AUTOCRAW_PROXY.trim()) merged.proxy = env.AUTOCRAW_PROXY.trim();
  if (typeof merged.browserPath === 'string') merged.browserPath = resolveBrowserExecutable(merged.browserPath);
  const parsed = configSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue: { path: PropertyKey[]; message: string }) => `${issue.path.join('.') || 'config'}: ${issue.message}`);
    throw new AutocrawError('E_CONFIG', `Invalid configuration: ${issues.join('; ')}`, { issues });
  }
  return parsed.data;
}
