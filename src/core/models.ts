import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AutocrawError } from '../utils/errors';
import { ensureDir } from '../utils/fs-safe';

export interface ModelRef {
  repo: string;
  file: string;
}

export function parseModelRef(spec: string): ModelRef {
  const trimmed = spec.trim();
  const match = /^([^/\s:]+\/[^/\s:]+)(?::(.+))?$/.exec(trimmed);
  if (!match) {
    throw new AutocrawError('E_INPUT', `"${spec}" does not look like a Hugging Face repo. Use the form owner/name or owner/name:file.gguf.`, { spec });
  }
  const repo = match[1] as string;
  const file = match[2]?.trim() ?? '';
  return { repo, file };
}

export function modelsDir(cacheDir: string): string {
  return join(cacheDir, 'models');
}

function safeFileName(name: string): string {
  const clean = basename(name.replace(/[\\/]/g, '_'));
  if (!clean || clean === '.' || clean === '..') throw new AutocrawError('E_INPUT', `Invalid model file name: ${name}`);
  return clean;
}

async function resolveFileFromRepo(repo: string): Promise<string> {
  const apiUrl = `https://huggingface.co/api/models/${repo}`;
  let response: Response;
  try {
    response = await fetch(apiUrl, { headers: { accept: 'application/json' } });
  } catch (error) {
    throw new AutocrawError('E_NETWORK', `Could not reach Hugging Face to list files for ${repo}.`, { repo }, error);
  }
  if (!response.ok) throw new AutocrawError('E_INPUT', `Hugging Face repo not found or private: ${repo} (HTTP ${response.status}). Pass the exact file with owner/name:file.gguf.`, { repo, status: response.status });
  const data = (await response.json()) as { siblings?: Array<{ rfilename?: string }> };
  const ggufs = (data.siblings ?? []).map((item) => item.rfilename).filter((name): name is string => Boolean(name && name.toLowerCase().endsWith('.gguf')));
  if (ggufs.length === 0) throw new AutocrawError('E_INPUT', `No .gguf files found in ${repo}. Pass the exact file with owner/name:file.gguf.`, { repo });
  const preferred = ggufs.find((name) => /q4_k_m/i.test(name)) ?? [...ggufs].sort((a, b) => a.length - b.length)[0];
  if (!preferred) throw new AutocrawError('E_INPUT', `No .gguf files found in ${repo}.`, { repo });
  return preferred;
}

export interface PullProgress {
  file: string;
  receivedBytes: number;
  totalBytes: number | null;
}

export async function pullModel(cacheDir: string, spec: string, onProgress?: (progress: PullProgress) => void): Promise<{ path: string; sha256: string; bytes: number }> {
  const ref = parseModelRef(spec);
  const file = ref.file || (await resolveFileFromRepo(ref.repo));
  const name = safeFileName(file);
  const dir = modelsDir(cacheDir);
  await ensureDir(dir);
  const target = resolve(dir, name);
  const url = `https://huggingface.co/${ref.repo}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}?download=true`;
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'follow' });
  } catch (error) {
    throw new AutocrawError('E_NETWORK', `Could not download ${url}`, { url }, error);
  }
  if (!response.ok || !response.body) {
    throw new AutocrawError('E_HTTP', `Download failed for ${ref.repo}:${file} (HTTP ${response.status}). Check the repo and file name.`, { repo: ref.repo, file, status: response.status });
  }
  const totalBytes = Number(response.headers.get('content-length') ?? '') || null;
  const hash = createHash('sha256');
  let received = 0;
  const nodeStream = Readable.fromWeb(response.body as never);
  nodeStream.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    onProgress?.({ file: name, receivedBytes: received, totalBytes });
  });
  const tempPath = `${target}.part`;
  try {
    await pipeline(nodeStream, createWriteStream(tempPath));
    await mkdir(dir, { recursive: true });
    await rm(target, { force: true });
    await import('node:fs/promises').then((fs) => fs.rename(tempPath, target));
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new AutocrawError('E_IO', `Could not save ${target}`, { target }, error);
  }
  return { path: target, sha256: hash.digest('hex'), bytes: received };
}

export interface LocalModel {
  name: string;
  path: string;
  bytes: number;
}

export async function listLocalModels(cacheDir: string): Promise<LocalModel[]> {
  const dir = modelsDir(cacheDir);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const models: LocalModel[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.gguf')) continue;
    const path = join(dir, entry);
    try {
      const info = await stat(path);
      models.push({ name: entry, path, bytes: info.size });
    } catch {
      continue;
    }
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

export interface OllamaModel {
  name: string;
  bytes: number;
}

export async function listOllamaModels(baseUrl: string): Promise<OllamaModel[] | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const data = (await response.json()) as { models?: Array<{ name?: string; size?: number }> };
    return (data.models ?? []).filter((item): item is { name: string; size?: number } => Boolean(item.name)).map((item) => ({ name: item.name, bytes: item.size ?? 0 }));
  } catch {
    return null;
  }
}

export async function removeLocalModel(cacheDir: string, name: string): Promise<string> {
  const dir = modelsDir(cacheDir);
  const safe = safeFileName(name);
  const target = resolve(dir, safe);
  if (!target.startsWith(resolve(dir))) throw new AutocrawError('E_INPUT', `Invalid model name: ${name}`);
  try {
    await rm(target);
  } catch (error) {
    throw new AutocrawError('E_IO', `Could not remove ${target}. Does it exist? Check with: zac models list`, { target }, error);
  }
  return target;
}
