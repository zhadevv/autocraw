import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { AutocrawError } from '../utils/errors';
import { writeFileAtomic } from '../utils/fs-safe';
import { expandHome } from '../utils/paths';

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface StoredState {
  cookies: StoredCookie[];
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

export interface SessionFile {
  version: 1;
  userAgent: string;
  origin: string;
  savedAt: string;
  state: StoredState;
}

export function resolveSessionPath(path: string): string {
  return resolve(expandHome(path.trim().replace(/^["']+|["']+$/g, '')));
}

export function loadSessionFile(rawPath: string): SessionFile {
  const path = resolveSessionPath(rawPath);
  let text: string;
  try {
    if (!statSync(path).isFile()) throw new Error('not a file');
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new AutocrawError('E_CONFIG', `Session file not found or unreadable: ${path}. Create one with: zac login <url> --session ${rawPath}`, { path }, error);
  }
  let parsed: Partial<SessionFile>;
  try {
    parsed = JSON.parse(text) as Partial<SessionFile>;
  } catch (error) {
    throw new AutocrawError('E_CONFIG', `Session file is not valid JSON: ${path}`, { path }, error);
  }
  if (parsed.version !== 1 || !parsed.state || !Array.isArray(parsed.state.cookies) || typeof parsed.userAgent !== 'string') {
    throw new AutocrawError('E_CONFIG', `Session file has an unknown format: ${path}. Recreate it with zac login.`, { path });
  }
  return parsed as SessionFile;
}

export async function saveSessionFile(rawPath: string, data: SessionFile): Promise<string> {
  const path = resolveSessionPath(rawPath);
  await writeFileAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);
  return path;
}

export function activeCookies(file: SessionFile, now = Date.now()): StoredCookie[] {
  return file.state.cookies.filter((cookie) => cookie.expires <= 0 || cookie.expires * 1000 > now);
}
