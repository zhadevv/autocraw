import OpenAI from 'openai';
import type { AIProvider, AIRequest, AIResponse } from './base';
import { classifyAIError, withAIRetries } from './base';
import { AutocrawError } from '../../../utils/errors';

export const OPENAI_DEFAULT_MODEL = 'gpt-4.1';

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  readonly model: string;
  private readonly client: OpenAI;
  private readonly maxRetries: number;

  constructor(options: OpenAIProviderOptions) {
    if (!options.apiKey || !options.apiKey.trim()) throw new AutocrawError('E_CONFIG', 'OpenAI API key is empty.');
    this.model = options.model ?? OPENAI_DEFAULT_MODEL;
    this.maxRetries = options.maxRetries ?? 3;
    this.client = new OpenAI({
      apiKey: options.apiKey.trim(),
      baseURL: options.baseUrl,
      timeout: options.timeoutMs ?? 180000,
      maxRetries: 0,
    });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const reasoning = /^(o\d|gpt-5)/i.test(this.model);
    return withAIRetries(
      async () => {
        const response = await this.client.chat.completions.create(
          {
            model: this.model,
            messages: [
              { role: 'system' as const, content: request.system },
              { role: 'user' as const, content: request.user },
            ],
            max_completion_tokens: request.maxOutputTokens,
            ...(reasoning || request.temperature === undefined ? {} : { temperature: request.temperature }),
          },
          { signal: request.signal },
        );
        const choice = response.choices[0];
        const text = choice?.message?.content ?? '';
        if (!text.trim()) {
          const refusal = choice?.message?.refusal;
          throw new AutocrawError('E_AI', refusal ? `OpenAI refused the request: ${refusal}` : `OpenAI returned an empty response (finish reason: ${choice?.finish_reason ?? 'unknown'}).`, { provider: 'openai', model: this.model });
        }
        return {
          text,
          model: response.model ?? this.model,
          inputTokens: response.usage?.prompt_tokens ?? null,
          outputTokens: response.usage?.completion_tokens ?? null,
          truncated: choice?.finish_reason === 'length',
        };
      },
      'openai',
      this.model,
      this.maxRetries,
      request.signal,
    ).catch((error: unknown) => {
      throw classifyAIError(error, 'openai', this.model);
    });
  }
}
