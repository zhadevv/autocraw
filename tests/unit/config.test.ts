import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/schema';
import { inferProvider } from '../../src/cli/parsers/args';

describe('config', () => {
  it('applies defaults and validates', () => {
    expect(resolveConfig().mode).toBe('auto');
    expect(() => resolveConfig({ concurrency: 0 })).toThrow(/Invalid configuration/);
    expect(() => resolveConfig({ include: ['('] })).toThrow(/regular expression/);
  });
});

describe('inferProvider', () => {
  it('infers from key prefix and env', () => {
    expect(inferProvider({ apiKey: 'sk-ant-abc' }, {}).provider).toBe('anthropic');
    expect(inferProvider({ apiKey: 'sk-abc' }, {}).provider).toBe('openai');
    expect(inferProvider({}, { OPENAI_API_KEY: 'k' }).provider).toBe('openai');
    expect(() => inferProvider({}, {})).toThrow(/needs a provider/);
  });

  it('falls back to ollama when its env is set and no key exists', () => {
    expect(inferProvider({}, { OLLAMA_MODEL: 'llama3.1' }).provider).toBe('ollama');
    expect(inferProvider({}, { OLLAMA_BASE_URL: 'http://localhost:11434' }).provider).toBe('ollama');
    expect(inferProvider({}, { OLLAMA_MODEL: 'llama3.1' }).apiKey).toBe('');
  });
});

describe('browser path', () => {
  it('reads AUTOCRAW_BROWSER_PATH and lets explicit config win', () => {
    const previous = process.env.AUTOCRAW_BROWSER_PATH;
    process.env.AUTOCRAW_BROWSER_PATH = '/opt/chrome/chrome';
    try {
      expect(resolveConfig().browserPath).toBe('/opt/chrome/chrome');
      expect(resolveConfig({ browserPath: '/other/chrome' }).browserPath).toBe('/other/chrome');
    } finally {
      if (previous === undefined) delete process.env.AUTOCRAW_BROWSER_PATH;
      else process.env.AUTOCRAW_BROWSER_PATH = previous;
    }
  });
});
