import type { AIOptions } from '../../../types';
import type { AIProvider } from './base';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider, OLLAMA_DEFAULT_BASE_URL, OLLAMA_DEFAULT_MODEL } from './ollama';
import { AutocrawError } from '../../../utils/errors';

export function createProvider(options: AIOptions): AIProvider {
  switch (options.provider) {
    case 'openai':
      return new OpenAIProvider({ apiKey: options.apiKey, model: options.model, baseUrl: options.baseUrl, timeoutMs: options.timeoutMs, maxRetries: options.maxRetries });
    case 'anthropic':
      return new AnthropicProvider({ apiKey: options.apiKey, model: options.model, baseUrl: options.baseUrl, timeoutMs: options.timeoutMs, maxRetries: options.maxRetries });
    case 'ollama':
      return new OllamaProvider({ model: options.model ?? OLLAMA_DEFAULT_MODEL, baseUrl: options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL, timeoutMs: options.timeoutMs, maxRetries: options.maxRetries });
    default:
      throw new AutocrawError('E_CONFIG', `Unknown AI provider "${String(options.provider)}". Use "openai", "anthropic" or "ollama".`);
  }
}

export type { AIProvider, AIRequest, AIResponse } from './base';
export { OpenAIProvider } from './openai';
export { AnthropicProvider } from './anthropic';
export { OllamaProvider, OLLAMA_DEFAULT_BASE_URL, OLLAMA_DEFAULT_MODEL } from './ollama';
