import { describe, expect, it } from 'vitest';
import { ensureUrl, isSameOrigin, normalizeUrl, sameSite } from '../../src/utils/normalize-url';

describe('normalizeUrl', () => {
  it('strips tracking params, hash and sorts the query', () => {
    expect(normalizeUrl('https://Example.com/a?b=2&utm_source=x&a=1#top')).toBe('https://example.com/a?a=1&b=2');
  });

  it('resolves relative URLs against a base', () => {
    expect(normalizeUrl('/page/2/', 'https://example.com/anime/')).toBe('https://example.com/page/2/');
  });

  it('rejects non-http protocols', () => {
    expect(normalizeUrl('javascript:void(0)')).toBeNull();
    expect(normalizeUrl('mailto:a@b.c')).toBeNull();
  });

  it('compares sites ignoring www', () => {
    expect(sameSite('https://www.example.com/a', 'https://example.com/b')).toBe(true);
    expect(isSameOrigin('https://example.com', 'http://example.com')).toBe(false);
  });

  it('adds a protocol when missing', () => {
    expect(ensureUrl('example.com/x')).toBe('https://example.com/x');
    expect(() => ensureUrl('ftp://example.com')).toThrow();
  });
});
