import type { AutocrawConfig } from '../types';
import type { SessionFile } from '../browser/session-file';
import { saveSessionFile } from '../browser/session-file';
import { browserHeaders, pickUserAgent, stealthInitScript } from '../browser/anti-block';
import { describeBrowserPath } from '../utils/paths';
import { AutocrawError } from '../utils/errors';
import { ensureUrl } from '../utils/normalize-url';

export interface LoginOptions {
  url: string;
  sessionFile: string;
  config: Pick<AutocrawConfig, 'userAgent' | 'rotateUserAgent' | 'locale' | 'proxy' | 'browserPath' | 'stealth'>;
  onReady: (prompt: string) => Promise<void>;
}

export interface LoginResult {
  path: string;
  origin: string;
  cookieCount: number;
}

export async function captureLoginSession(options: LoginOptions): Promise<LoginResult> {
  const url = ensureUrl(options.url);
  const origin = new URL(url).origin;
  let playwright: typeof import('playwright');
  try {
    playwright = await import('playwright');
  } catch (error) {
    throw new AutocrawError('E_BROWSER', 'Playwright is not installed. Run: npm install playwright && npx playwright install chromium', {}, error);
  }
  const executablePath = options.config.browserPath ?? undefined;
  if (executablePath) {
    const problem = describeBrowserPath(executablePath);
    if (problem) throw new AutocrawError('E_BROWSER', `Invalid browser path: ${problem}.`, { executablePath });
  }
  let browser: import('playwright').Browser;
  try {
    browser = await playwright.chromium.launch({
      executablePath,
      headless: false,
      proxy: options.config.proxy ? { server: options.config.proxy } : undefined,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    const needsDisplay = /display|x server|xserver|headed browser without/i.test(message);
    const hint = needsDisplay
      ? ' This needs a visible desktop. Run it on your own machine with a screen (not a headless server or container), or use "xvfb-run zac login ..." if you accept a virtual display instead of solving it yourself.'
      : executablePath
        ? ` The executable at ${executablePath} failed to start: ${message}`
        : ' Install it with: npx playwright install chromium';
    throw new AutocrawError('E_BROWSER', `Cannot open a visible browser window.${hint}`, { executablePath }, error);
  }
  try {
    const userAgent = options.config.userAgent ?? pickUserAgent(options.config);
    const context = await browser.newContext({
      userAgent,
      locale: options.config.locale,
      viewport: { width: 1366, height: 768 },
    });
    if (options.config.stealth) await context.addInitScript(stealthInitScript(options.config.locale));
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
    await options.onReady(`A browser window is open at ${url}. Solve any verification yourself, log in if needed, then come back here.`);
    const state = await context.storageState();
    const resolvedAgent = await page.evaluate(() => navigator.userAgent).catch(() => userAgent);
    const file: SessionFile = { version: 1, userAgent: resolvedAgent, origin, savedAt: new Date().toISOString(), state };
    const path = await saveSessionFile(options.sessionFile, file);
    return { path, origin, cookieCount: state.cookies.length };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
