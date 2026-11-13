import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export function defaultCacheDir(): string {
  const base = process.env.AUTOCRAW_CACHE_DIR;
  if (base) return resolve(base);
  return join(homedir(), '.cache', 'autocraw');
}

export function slugifyHost(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

export function expandHome(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2));
  return value;
}

const BROWSER_BINARIES = ['chrome', 'google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome.exe'];

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function resolveBrowserExecutable(raw: string): string {
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, '');
  const expanded = resolve(expandHome(cleaned));
  try {
    if (statSync(expanded).isDirectory()) {
      for (const name of BROWSER_BINARIES) {
        const candidate = join(expanded, name);
        if (isFile(candidate)) return candidate;
      }
    }
  } catch {
    return expanded;
  }
  return expanded;
}

export function describeBrowserPath(path: string): string | null {
  if (isFile(path)) return null;
  try {
    if (statSync(path).isDirectory()) return `${path} is a directory without a Chrome/Chromium binary inside`;
  } catch {
    return `${path} does not exist`;
  }
  return `${path} is not a file`;
}
