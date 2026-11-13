import type { AIProvider, AIRequest, AIResponse } from './base';
import { classifyAIError, withAIRetries } from './base';
import { AutocrawError } from '../../../utils/errors';

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';
export const OLLAMA_DEFAULT_MODEL = 'llama3.1';

export interface OllamaProviderOptions {
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

interface OllamaChatResponse {
  model?: string;
  message?: { role?: string; content?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama' as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: OllamaProviderOptions = {}) {
    this.model = options.model ?? OLLAMA_DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 180000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    return withAIRetries(
      async () => {
        const signals: AbortSignal[] = [AbortSignal.timeout(this.timeoutMs)];
        if (request.signal) signals.push(request.signal);
        let response: Response;
        try {
          response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: this.model,
              messages: [
                { role: 'system', content: request.system },
                { role: 'user', content: request.user },
              ],
              stream: false,
              options: {
                num_predict: request.maxOutputTokens,
                ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
              },
            }),
            signal: AbortSignal.any(signals),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/econnrefused|fetch failed/i.test(message)) {
            throw new AutocrawError('E_NETWORK', `Could not reach Ollama at ${this.baseUrl}. Is "ollama serve" running? Set --ai-base-url or OLLAMA_BASE_URL to the right address.`, { baseUrl: this.baseUrl }, error);
          }
          throw error;
        }
        const text = await response.text();
        let data: OllamaChatResponse;
        try {
          data = JSON.parse(text) as OllamaChatResponse;
        } catch (error) {
          throw new AutocrawError('E_AI', `Ollama returned a non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`, { status: response.status }, error);
        }
        if (!response.ok || data.error) {
          const message = data.error ?? `HTTP ${response.status}`;
          if (/not found|no such model|pull/i.test(message)) {
            throw new AutocrawError('E_CONFIG', `Ollama model "${this.model}" is not available. Pull it first: ollama pull ${this.model}`, { model: this.model, message });
          }
          throw new AutocrawError('E_AI', `Ollama request failed: ${message}`, { status: response.status, message });
        }
        const content = data.message?.content ?? '';
        if (!content.trim()) throw new AutocrawError('E_AI', `Ollama returned an empty response (done_reason: ${data.done_reason ?? 'unknown'}).`, { model: this.model });
        return {
          text: content,
          model: data.model ?? this.model,
          inputTokens: data.prompt_eval_count ?? null,
          outputTokens: data.eval_count ?? null,
          truncated: data.done_reason === 'length',
        };
      },
      'ollama',
      this.model,
      this.maxRetries,
      request.signal,
    ).catch((error: unknown) => {
      throw classifyAIError(error, 'ollama', this.model);
    });
  }
}
