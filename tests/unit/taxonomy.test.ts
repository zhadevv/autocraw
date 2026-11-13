import { describe, expect, it } from 'vitest';
import { classifyUrl, groupUrls, patternKey } from '../../src/classify/taxonomy';

describe('taxonomy', () => {
  it('builds stable pattern keys', () => {
    expect(patternKey(new URL('https://x.com/anime/one-piece-subtitle-indonesia/'))).toBe('/anime/{slug}');
    expect(patternKey(new URL('https://x.com/page/12/'))).toBe('/page/{id}');
    expect(patternKey(new URL('https://x.com/?s=abc'))).toBe('/?s=*');
  });

  it('classifies generic URLs', () => {
    expect(classifyUrl('https://x.com/')).toBe('home');
    expect(classifyUrl('https://x.com/?s=abc')).toBe('search');
    expect(classifyUrl('https://x.com/static/a.css')).toBe('asset');
    expect(classifyUrl('https://x.com/feed/')).toBe('feed');
    expect(classifyUrl('https://x.com/privacy-policy/')).toBe('static');
    expect(classifyUrl('https://x.com/genre/action/')).toBe('taxonomy');
  });

  it('groups URLs by pattern', () => {
    const groups = groupUrls(['https://x.com/anime/a-very-long-title-one/', 'https://x.com/anime/a-very-long-title-two/', 'https://x.com/about/']);
    expect(groups[0]?.count).toBe(2);
    expect(groups[0]?.pattern).toBe('/anime/{slug}');
  });
});
