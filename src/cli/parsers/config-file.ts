import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { configSchema } from '../../config/schema';
import type { AutocrawConfigInput } from '../../types';
import { AutocrawError } from '../../utils/errors';
import { readJsonFile } from '../../utils/fs-safe';

const CANDIDATES = ['autocraw.config.json', '.autocrawrc.json'];

export async function loadConfigFile(explicitPath?: string): Promise<AutocrawConfigInput> {
  let path: string | null = null;
  if (explicitPath) {
    path = resolve(explicitPath);
    if (!existsSync(path)) throw new AutocrawError('E_CONFIG', `Config file not found: ${path}`);
  } else {
    for (const candidate of CANDIDATES) {
      const full = resolve(process.cwd(), candidate);
      if (existsSync(full)) {
        path = full;
        break;
      }
    }
  }
  if (!path) return {};
  const raw = await readJsonFile<unknown>(path);
  const parsed = configSchema.partial().strict().safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue: { path: PropertyKey[]; message: string }) => `${issue.path.join('.') || 'config'}: ${issue.message}`);
    throw new AutocrawError('E_CONFIG', `Invalid config file ${path}: ${issues.join('; ')}`, { path, issues });
  }
  return parsed.data as AutocrawConfigInput;
}
