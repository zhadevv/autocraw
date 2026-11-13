import type { MarkdownOptions, MarkdownOptionsInput, MarkdownResult, SiteReport } from '../types';
import { AutocrawError, isAutocrawError, toMessage } from '../utils/errors';
import { generateDefaultMarkdown } from './default/generator';
import { generateAiMarkdown } from './ai/generator';

const TEMPLATES = ['site-structure', 'seo-audit', 'techstack'] as const;
const LANGUAGES = ['en', 'id'] as const;
const MODES = ['default', 'ai'] as const;

export function resolveMarkdownOptions(input: MarkdownOptionsInput = {}): MarkdownOptions {
  const options: MarkdownOptions = {
    mode: input.mode ?? (input.ai ? 'ai' : 'default'),
    template: input.template ?? 'site-structure',
    language: input.language ?? 'en',
    frontmatter: input.frontmatter ?? true,
    toc: input.toc ?? true,
    maxExamples: input.maxExamples ?? 3,
    ai: input.ai,
  };
  if (!MODES.includes(options.mode)) throw new AutocrawError('E_CONFIG', `Invalid markdown mode "${options.mode}". Use "default" or "ai".`);
  if (!TEMPLATES.includes(options.template)) throw new AutocrawError('E_CONFIG', `Invalid markdown template "${options.template}". Use one of: ${TEMPLATES.join(', ')}.`);
  if (!LANGUAGES.includes(options.language)) throw new AutocrawError('E_CONFIG', `Invalid language "${options.language}". Use "en" or "id".`);
  if (!Number.isInteger(options.maxExamples) || options.maxExamples < 1 || options.maxExamples > 10) throw new AutocrawError('E_CONFIG', 'maxExamples must be an integer between 1 and 10.');
  return options;
}

export async function generateMarkdown(report: SiteReport, input: MarkdownOptionsInput = {}, signal?: AbortSignal): Promise<MarkdownResult> {
  const options = resolveMarkdownOptions(input);
  if (options.mode === 'default') {
    return {
      markdown: generateDefaultMarkdown(report, options),
      mode: 'default',
      template: options.template,
      usedFallback: false,
      cached: false,
      provider: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      warnings: [],
    };
  }
  try {
    return await generateAiMarkdown(report, options, signal);
  } catch (error) {
    if (options.ai?.fallbackToDefault && isAutocrawError(error) && error.code !== 'E_CONFIG') {
      return {
        markdown: generateDefaultMarkdown(report, { ...options, mode: 'default' }),
        mode: 'default',
        template: options.template,
        usedFallback: true,
        cached: false,
        provider: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        warnings: [`AI generation failed (${error.code}): ${toMessage(error)}. Fell back to the deterministic generator.`],
      };
    }
    throw error;
  }
}

export { generateDefaultMarkdown } from './default/generator';
export { generateAiMarkdown } from './ai/generator';
