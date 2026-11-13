import { describe, expect, it } from 'vitest';
import { analyzeInterceptions, classifyHost, classifyKind } from '../../src/browser/intercept';
import type { InterceptEntry } from '../../src/browser/intercept';

function entry(url: string, overrides: Partial<InterceptEntry> = {}): InterceptEntry {
  return {
    url,
    path: '',
    method: 'GET',
    status: 200,
    resourceType: 'xhr',
    contentType: 'application/json',
    size: 100,
    params: {},
    postData: null,
    requestHeaders: {},
    headers: {},
    bodySnippet: null,
    ...overrides,
  };
}

describe('classifyHost', () => {
  it('marks the base host, subdomains and external hosts', () => {
    expect(classifyHost('https://example.com/a', 'example.com').relation).toBe('base');
    expect(classifyHost('https://api.example.com/a', 'example.com').relation).toBe('subdomain');
    expect(classifyHost('https://cdn.other.net/a', 'example.com').relation).toBe('external');
    expect(classifyHost('https://example.com.evil.net/a', 'example.com').relation).toBe('external');
  });
});

describe('classifyKind', () => {
  it('recognises framework payload paths', () => {
    expect(classifyKind('https://example.com/_next/data/BuildID/news.json', 'fetch', 'application/json')).toBe('next-data');
    expect(classifyKind('https://example.com/news?rsc=1', 'fetch', 'text/html')).toBe('rsc');
    expect(classifyKind('https://example.com/_data/feed.json', 'xhr', 'application/json')).toBe('data');
    expect(classifyKind('https://example.com/api/users', 'xhr', 'application/json')).toBe('api');
    expect(classifyKind('https://example.com/v2/items', 'xhr', 'application/json')).toBe('versioned-api');
    expect(classifyKind('https://api.example.com/graphql', 'fetch', 'application/json')).toBe('graphql');
    expect(classifyKind('https://api.example.com/trpc/user.list', 'fetch', 'application/json')).toBe('trpc');
  });

  it('falls back to resource type for media, documents and static assets', () => {
    expect(classifyKind('https://cdn.example.com/bg.webp', 'image', 'image/webp')).toBe('media');
    expect(classifyKind('https://example.com/', 'document', 'text/html')).toBe('document');
    expect(classifyKind('https://example.com/app.js', 'script', 'application/javascript')).toBe('static');
    expect(classifyKind('https://example.com/random?x=1', 'xhr', 'text/plain')).toBe('other');
  });
});

describe('analyzeInterceptions', () => {
  const base = 'example.com';
  const entries = [
    entry('https://example.com/', { resourceType: 'document', contentType: 'text/html' }),
    entry('https://example.com/app.js', { resourceType: 'script', contentType: 'application/javascript' }),
    entry('https://example.com/api/users', { status: 200 }),
    entry('https://example.com/api/users', { status: 200 }),
    entry('https://api.example.com/graphql', { method: 'POST', status: 500 }),
    entry('https://cdn.example.com/bg.webp', { resourceType: 'image', contentType: 'image/webp' }),
  ];

  it('groups by host with correct relations and error counts', () => {
    const { domains } = analyzeInterceptions(entries, base);
    expect(domains).toHaveLength(3);
    const baseDomain = domains.find((domain) => domain.host === 'example.com');
    expect(baseDomain?.relation).toBe('base');
    expect(baseDomain?.requests).toBe(4);
    expect(baseDomain?.errors).toBe(0);
    const apiDomain = domains.find((domain) => domain.host === 'api.example.com');
    expect(apiDomain?.relation).toBe('subdomain');
    expect(apiDomain?.requests).toBe(1);
    expect(apiDomain?.errors).toBe(1);
  });

  it('collects unique endpoints with merged statuses', () => {
    const { endpoints } = analyzeInterceptions(entries, base);
    const users = endpoints.find((endpoint) => endpoint.url === 'https://example.com/api/users');
    expect(users?.requests).toBe(2);
    expect(users?.statuses).toEqual([200]);
    expect(users?.kinds).toContain('api');
    const graphql = endpoints.find((endpoint) => endpoint.url === 'https://api.example.com/graphql');
    expect(graphql?.method).toBe('POST');
    expect(graphql?.statuses).toEqual([500]);
  });

  it('notes the absence of api-like payloads', () => {
    const { notes } = analyzeInterceptions([entry('https://example.com/app.js', { resourceType: 'script', contentType: 'application/javascript' })], base);
    expect(notes.some((note) => note.includes('api-like payloads'))).toBe(true);
  });
});
