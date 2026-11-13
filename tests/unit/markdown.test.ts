import { describe, expect, it } from 'vitest';
import { generateMarkdown, resolveMarkdownOptions } from '../../src/markdown';
import { buildContext } from '../../src/markdown/ai/context-builder';
import { stripWrappingFence } from '../../src/markdown/ai/generator';
import type { SiteReport } from '../../src/types';

export function fakeReport(): SiteReport {
  return {
    schemaVersion: 1,
    target: 'https://anime.test/',
    origin: 'https://anime.test',
    generatedAt: '2026-01-01T00:00:00.000Z',
    version: '0.0.1',
    home: { url: 'https://anime.test/', status: 200, title: 'Anime Test', via: 'http', seo: null },
    techstack: {
      technologies: [{ name: 'WordPress', category: 'cms', version: '6.5', confidence: 1, evidence: ['wp-content'] }],
      primaryFramework: null,
      cms: 'WordPress',
      renderStrategy: 'ssr',
      renderReasons: ['Raw HTML already contains the content.'],
      dataFormat: 'html-only',
      dataReasons: ['No hydration payloads.'],
    },
    ssr: { detected: ['none'], payloads: [] },
    hydration: null,
    template: { id: 'wordpress-animestream', name: 'AnimeStream', vendor: 'Themesia', confidence: 0.9, contentType: 'anime' },
    robots: { found: true, url: 'https://anime.test/robots.txt', sitemaps: [], crawlDelay: null, disallowAll: false, disallowed: ['/wp-admin/'], allowed: [] },
    sitemap: { found: false, sources: [], totalUrls: 0, sample: [], groups: [] },
    urlGroups: [{ pattern: '/anime/{slug}', kind: 'detail', count: 3, examples: ['https://anime.test/anime/a-long-title/'] }],
    patterns: [{ kind: 'detail', pattern: '/anime/{slug}/', description: 'Series page', example: null }],
    listing: [],
    pagination: { detected: true, scheme: 'path', pattern: 'https://anime.test/anime/page/{n}/', current: 1, last: 10, next: 'https://anime.test/anime/page/2/', prev: null, verified: true, notes: [] },
    search: { detected: true, method: 'GET', action: 'https://anime.test/', param: 's', extraParams: {}, sampleUrl: 'https://anime.test/?s=naruto', sampleQuery: 'naruto', resultCount: 5, verified: true, liveSearch: false, notes: [] },
    filters: null,
    detail: null,
    watch: null,
    read: null,
    media: null,
    network: [],
    crawl: null,
    caveats: ['Sample caveat | with pipe'],
    timings: { robots: 10 },
  };
}

describe('default markdown', () => {
  it('renders a deterministic document with frontmatter, toc and tables', async () => {
    const result = await generateMarkdown(fakeReport(), { mode: 'default' });
    expect(result.mode).toBe('default');
    expect(result.markdown.startsWith('---\n')).toBe(true);
    expect(result.markdown).toContain('\u0023 Site Structure Report: anime.test');
    expect(result.markdown).toContain('| WordPress | cms | 6.5 | 100% | wp-content |');
    expect(result.markdown).toContain('Sample caveat | with pipe');
    expect(result.markdown).toContain('[Tech Stack](\u0023tech-stack)');
  });

  it('supports Indonesian and other templates', async () => {
    const id = await generateMarkdown(fakeReport(), { mode: 'default', language: 'id' });
    expect(id.markdown).toContain('Laporan Struktur Situs');
    const seo = await generateMarkdown(fakeReport(), { mode: 'default', template: 'seo-audit', frontmatter: false, toc: false });
    expect(seo.markdown.startsWith('\u0023 SEO Audit Report')).toBe(true);
  });

  it('is identical across runs', async () => {
    const a = await generateMarkdown(fakeReport(), { mode: 'default' });
    const b = await generateMarkdown(fakeReport(), { mode: 'default' });
    expect(a.markdown).toBe(b.markdown);
  });
});

describe('ai markdown helpers', () => {
  it('requires an api key in ai mode', async () => {
    await expect(generateMarkdown(fakeReport(), { mode: 'ai', ai: { provider: 'openai', apiKey: '' } })).rejects.toThrow(/Missing API key/);
  });

  it('falls back to the default generator when asked to', async () => {
    const result = await generateMarkdown(fakeReport(), { mode: 'ai', ai: { provider: 'openai', apiKey: 'sk-test', baseUrl: 'http://127.0.0.1:1', maxRetries: 0, timeoutMs: 2000, cache: false, fallbackToDefault: true } });
    expect(result.usedFallback).toBe(true);
    expect(result.mode).toBe('default');
    expect(result.warnings[0]).toMatch(/Fell back/);
  });

  it('validates options', () => {
    expect(() => resolveMarkdownOptions({ template: 'nope' as never })).toThrow(/Invalid markdown template/);
    expect(() => resolveMarkdownOptions({ maxExamples: 0 })).toThrow(/maxExamples/);
  });

  it('builds a context within the token budget and reports trimming', () => {
    const context = buildContext(fakeReport(), 100000, 3);
    expect(context.tokens).toBeGreaterThan(0);
    expect(context.trimmed).toEqual([]);
    expect(() => buildContext(fakeReport(), 10, 3)).toThrow(/exceeds the maxInputTokens/);
  });

  it('strips a wrapping markdown fence', () => {
    const fence = '`'.repeat(3);
    expect(stripWrappingFence(`${fence}markdown\n\u0023 Title\n\nBody\n${fence}`)).toBe('\u0023 Title\n\nBody');
    expect(stripWrappingFence('\u0023 Title')).toBe('\u0023 Title');
  });
});
