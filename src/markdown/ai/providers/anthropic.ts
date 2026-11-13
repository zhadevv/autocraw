import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIRequest, AIResponse } from './base';
import { classifyAIError, withAIRetries } from './base';
import { AutocrawError } from '../../../utils/errors';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5-5';

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly maxRetries: number;

  constructor(options: AnthropicProviderOptions) {
    if (!options.apiKey || !options.apiKey.trim()) throw new AutocrawError('E_CONFIG', 'Anthropic API key is empty.');
    this.model = options.model ?? ANTHROPIC_DEFAULT_MODEL;
    this.maxRetries = options.maxRetries ?? 3;
    this.client = new Anthropic({
      apiKey: options.apiKey.trim(),
      baseURL: options.baseUrl,
      timeout: options.timeoutMs ?? 180000,
      maxRetries: 0,
    });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    return withAIRetries(
      async () => {
        const response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages: [{ role: 'user' as const, content: request.user }],
            ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          },
          { signal: request.signal },
        );
        let text = '';
        for (const block of response.content) {
          if (block.type === 'text') text += block.text;
        }
        if (!text.trim()) {
          throw new AutocrawError('E_AI', `Anthropic returned an empty response (stop reason: ${response.stop_reason ?? 'unknown'}).`, { provider: 'anthropic', model: this.model });
        }
        return {
          text,
          model: response.model ?? this.model,
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          truncated: response.stop_reason === 'max_tokens',
        };
      },
      'anthropic',
      this.model,
      this.maxRetries,
      request.signal,
    ).catch((error: unknown) => {
      throw classifyAIError(error, 'anthropic', this.model);
    });
  }
}
