import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { AutocrawError } from './errors';

export async function ensureDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    throw new AutocrawError('E_IO', `Cannot create directory ${path}`, { path }, error);
  }
}

export async function writeFileAtomic(path: string, content: string, mode?: number): Promise<void> {
  const target = resolve(path);
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await ensureDir(dirname(target));
    await writeFile(temp, content, { encoding: 'utf8', mode });
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw new AutocrawError('E_IO', `Cannot write file ${target}`, { path: target }, error);
  }
}

export async function writeBufferAtomic(path: string, content: Buffer): Promise<void> {
  const target = resolve(path);
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await ensureDir(dirname(target));
    await writeFile(temp, content);
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw new AutocrawError('E_IO', `Cannot write file ${target}`, { path: target }, error);
  }
}

export async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(resolve(path), 'utf8');
  } catch (error) {
    throw new AutocrawError('E_IO', `Cannot read file ${path}`, { path }, error);
  }
}

export async function readJsonFile<T = unknown>(path: string): Promise<T> {
  const raw = await readTextFile(path);
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new AutocrawError('E_PARSE', `Invalid JSON in ${path}`, { path }, error);
  }
}

export async function readCacheEntry(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
