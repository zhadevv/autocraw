import { InvalidArgumentError } from 'commander';
import type { AIOptions, AIProviderName, AutocrawConfigInput, FetchMode, MarkdownOptionsInput } from '../../types';
import { AutocrawError } from '../../utils/errors';
import { loadConfigFile } from './config-file';

export function intArg(name: string, min: number, max: number): (value: string) => number {
  return (value: string): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new InvalidArgumentError(`${name} must be an integer between ${min} and ${max}.`);
    return parsed;
  };
}

export function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function headerArg(value: string, previous: Record<string, string>): Record<string, string> {
  const index = value.indexOf(':');
  if (index <= 0) throw new InvalidArgumentError('Header must look like "Name: value".');
  return { ...previous, [value.slice(0, index).trim().toLowerCase()]: value.slice(index + 1).trim() };
}

export interface CommonOptions {
  mode?: FetchMode;
  config?: string;
  userAgent?: string;
  rotateUa?: boolean;
  proxy?: string;
  browserPath?: string;
  session?: string;
  timeout?: number;
  retries?: number;
  concurrency?: number;
  delay?: number;
  ignoreRobots?: boolean;
  header?: Record<string, string>;
  headed?: boolean;
  stealth?: boolean;
  loadImages?: boolean;
  scroll?: boolean;
  maxPages?: number;
  maxDepth?: number;
  include?: string[];
  exclude?: string[];
  verbose?: boolean;
  sitemap?: boolean;
  locale?: string;
  solveCaptcha?: boolean;
  captchaKind?: string;
}

export async function buildConfig(options: CommonOptions): Promise<AutocrawConfigInput> {
  const fromFile = await loadConfigFile(options.config);
  const fromCli: AutocrawConfigInput = {};
  if (options.mode) fromCli.mode = options.mode;
  if (options.userAgent) fromCli.userAgent = options.userAgent;
  if (options.rotateUa) fromCli.rotateUserAgent = true;
  if (options.proxy) fromCli.proxy = options.proxy;
  if (options.browserPath) fromCli.browserPath = options.browserPath;
  if (options.session) fromCli.sessionFile = options.session;
  if (options.timeout !== undefined) fromCli.timeoutMs = options.timeout;
  if (options.retries !== undefined) fromCli.retries = options.retries;
  if (options.concurrency !== undefined) fromCli.concurrency = options.concurrency;
  if (options.delay !== undefined) fromCli.delayMs = options.delay;
  if (options.ignoreRobots) fromCli.respectRobots = false;
  if (options.header && Object.keys(options.header).length > 0) fromCli.headers = options.header;
  if (options.headed) fromCli.headless = false;
  if (options.stealth === false) fromCli.stealth = false;
  if (options.loadImages) fromCli.blockResources = false;
  if (options.scroll) fromCli.scroll = true;
  if (options.maxPages !== undefined) fromCli.maxPages = options.maxPages;
  if (options.maxDepth !== undefined) fromCli.maxDepth = options.maxDepth;
  if (options.include && options.include.length > 0) fromCli.include = options.include;
  if (options.exclude && options.exclude.length > 0) fromCli.exclude = options.exclude;
  if (options.verbose) fromCli.verbose = true;
  if (options.sitemap === false) fromCli.useSitemap = false;
  if (options.locale) fromCli.locale = options.locale;
  if (options.solveCaptcha) fromCli.solveCaptcha = true;
  if (options.captchaKind) fromCli.captchaKind = options.captchaKind as AutocrawConfigInput['captchaKind'];
  return { ...fromFile, ...fromCli, headers: { ...(fromFile.headers ?? {}), ...(fromCli.headers ?? {}) } };
}

export interface MarkdownCliOptions {
  markdown?: 'default' | 'ai';
  mdTemplate?: 'site-structure' | 'seo-audit' | 'techstack';
  lang?: 'en' | 'id';
  aiProvider?: AIProviderName;
  apiKey?: string;
  aiModel?: string;
  aiBaseUrl?: string;
  aiMaxInput?: number;
  aiMaxOutput?: number;
  aiTemperature?: number;
  aiTimeout?: number;
  cache?: boolean;
  aiFallback?: boolean;
  toc?: boolean;
  frontmatter?: boolean;
}

export function inferProvider(options: MarkdownCliOptions, env: NodeJS.ProcessEnv = process.env): { provider: AIProviderName; apiKey: string } {
  const explicitKey = options.apiKey ?? env.AUTOCRAW_API_KEY;
  let provider = options.aiProvider;
  if (!provider && explicitKey) provider = explicitKey.startsWith('sk-ant-') ? 'anthropic' : 'openai';
  if (!provider) {
    if (env.ANTHROPIC_API_KEY) provider = 'anthropic';
    else if (env.OPENAI_API_KEY) provider = 'openai';
    else if (env.OLLAMA_BASE_URL || env.OLLAMA_MODEL) provider = 'ollama';
  }
  if (provider === 'ollama') return { provider: 'ollama', apiKey: explicitKey ?? '' };
  if (!provider) {
    throw new AutocrawError('E_CONFIG', 'AI markdown needs a provider. Use --api-key <key> with --ai-provider <openai|anthropic>, set OPENAI_API_KEY or ANTHROPIC_API_KEY, or run a local model and set --ai-provider ollama (or OLLAMA_BASE_URL / OLLAMA_MODEL).');
  }
  const apiKey = explicitKey ?? (provider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY);
  if (!apiKey) throw new AutocrawError('E_CONFIG', `No API key found for provider "${provider}". Use --api-key or set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'}.`);
  return { provider, apiKey };
}

export function buildAiOptions(options: MarkdownCliOptions, env: NodeJS.ProcessEnv = process.env): AIOptions {
  const { provider, apiKey } = inferProvider(options, env);
  const envBaseUrl = provider === 'ollama' ? env.OLLAMA_BASE_URL : provider === 'anthropic' ? env.ANTHROPIC_BASE_URL : env.OPENAI_BASE_URL;
  const envModel = provider === 'ollama' ? env.OLLAMA_MODEL : undefined;
  return {
    provider,
    apiKey,
    model: options.aiModel ?? envModel,
    baseUrl: options.aiBaseUrl ?? envBaseUrl,
    maxInputTokens: options.aiMaxInput,
    maxOutputTokens: options.aiMaxOutput,
    temperature: options.aiTemperature,
    timeoutMs: options.aiTimeout,
    cache: options.cache !== false,
    fallbackToDefault: Boolean(options.aiFallback),
  };
}

export function buildMarkdownOptions(options: MarkdownCliOptions): MarkdownOptionsInput {
  const mode = options.markdown ?? 'default';
  const base: MarkdownOptionsInput = {
    mode,
    template: options.mdTemplate ?? 'site-structure',
    language: options.lang ?? 'en',
    toc: options.toc !== false,
    frontmatter: options.frontmatter !== false,
  };
  if (mode !== 'ai') return base;
  return { ...base, ai: buildAiOptions(options) };
}
