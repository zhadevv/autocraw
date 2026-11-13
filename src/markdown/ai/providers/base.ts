import type { AIProviderName } from '../../../types';
import { AutocrawError } from '../../../utils/errors';
import { jitter, sleep } from '../../../utils/sleep';

export interface AIRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface AIResponse {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  truncated: boolean;
}

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  generate(request: AIRequest): Promise<AIResponse>;
}

interface ErrorLike {
  status?: number;
  message?: string;
  code?: string;
  name?: string;
  headers?: Record<string, string> | { get?: (key: string) => string | null };
  error?: { message?: string; type?: string };
}

export function classifyAIError(error: unknown, provider: AIProviderName, model: string): AutocrawError {
  if (error instanceof AutocrawError) return error;
  const e = (error ?? {}) as ErrorLike;
  const status = typeof e.status === 'number' ? e.status : null;
  const message = e.error?.message ?? e.message ?? String(error);
  const lower = message.toLowerCase();
  const details = { provider, model, status };
  if (status === 401 || status === 403) return new AutocrawError('E_AI_AUTH', `${provider} rejected the API key (HTTP ${status}). Check that the key is valid and has access to model "${model}".`, details, error);
  if (status === 429 && /quota|billing|credit/.test(lower)) return new AutocrawError('E_AI_AUTH', `${provider} account has no remaining quota or credit: ${message}`, details, error);
  if (status === 429) return new AutocrawError('E_AI_RATE_LIMIT', `${provider} rate limit reached: ${message}`, details, error);
  if (status === 404) return new AutocrawError('E_AI', `${provider} could not find model "${model}": ${message}`, details, error);
  if (status === 400 && /context|too long|maximum.*tokens|max_tokens|token limit/.test(lower)) return new AutocrawError('E_AI_CONTEXT', `The prompt or requested output exceeds the context limit of "${model}": ${message}`, details, error);
  if (status !== null && status >= 500) return new AutocrawError('E_AI', `${provider} server error (HTTP ${status}): ${message}`, details, error);
  if (e.name === 'AbortError' || /timed out|timeout/.test(lower)) return new AutocrawError('E_TIMEOUT', `${provider} request timed out`, details, error);
  if (/econnreset|enotfound|econnrefused|fetch failed|network|socket|connection/.test(lower)) return new AutocrawError('E_NETWORK', `Could not reach ${provider}: ${message}`, details, error);
  return new AutocrawError('E_AI', `${provider} request failed: ${message}`, details, error);
}

export function isRetryableAIError(error: AutocrawError): boolean {
  if (error.code === 'E_AI_RATE_LIMIT' || error.code === 'E_NETWORK' || error.code === 'E_TIMEOUT') return true;
  const status = error.details.status;
  return error.code === 'E_AI' && typeof status === 'number' && status >= 500;
}

function retryAfterMs(error: unknown): number | null {
  const headers = ((error ?? {}) as ErrorLike).headers;
  if (!headers) return null;
  const raw = typeof (headers as { get?: unknown }).get === 'function' ? (headers as { get: (key: string) => string | null }).get('retry-after') : (headers as Record<string, string>)['retry-after'];
  const seconds = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 60000) : null;
}

export async function withAIRetries<T>(fn: () => Promise<T>, provider: AIProviderName, model: string, maxRetries: number, signal?: AbortSignal): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const classified = classifyAIError(error, provider, model);
      if (signal?.aborted || attempt >= maxRetries || !isRetryableAIError(classified)) throw classified;
      const wait = retryAfterMs(error) ?? jitter(1000 * 2 ** attempt);
      attempt += 1;
      await sleep(wait, signal);
    }
  }
}
