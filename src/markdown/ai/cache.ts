import { join } from 'node:path';
import { readCacheEntry, writeFileAtomic } from '../../utils/fs-safe';
import { sha256 } from '../../utils/hash';
import { defaultCacheDir } from '../../utils/paths';
import type { AIProviderName } from '../../types';

export interface CacheEntry {
  markdown: string;
  provider: AIProviderName;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export class AICache {
  private readonly dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? join(defaultCacheDir(), 'ai');
  }

  key(parts: string[]): string {
    return sha256(parts.join('\u0000'));
  }

  private path(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  async get(key: string): Promise<CacheEntry | null> {
    const raw = await readCacheEntry(this.path(key));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CacheEntry;
      return typeof parsed.markdown === 'string' && parsed.markdown.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    try {
      await writeFileAtomic(this.path(key), JSON.stringify(entry));
    } catch {
      return;
    }
  }
}
