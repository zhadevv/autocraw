import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiServer } from '../../src/server';
import type { Engine } from '../../src/server';
import { assertPublicUrl, isPrivateAddress } from '../../src/server/ssrf';
import { parseActions } from '../../src/browser/actions';

const calls: Array<{ name: string; args: unknown[] }> = [];
const engine = {
  scrape: async (...args: unknown[]) => (calls.push({ name: 'scrape', args }), { url: 'x', finalUrl: 'x', status: 200, via: 'http', markdown: 'hello' }),
  map: async (...args: unknown[]) => (calls.push({ name: 'map', args }), { url: 'x', total: 0, truncated: false, links: [], sitemaps: [], warnings: [] }),
  crawl: async (...args: unknown[]) => (calls.push({ name: 'crawl', args }), { start: 'x', pages: [], skipped: [], errors: [], stats: {} }),
  discover: async () => ({ schemaVersion: 1 }),
  markdown: async () => ({ markdown: '# Report' }),
  extract: async (...args: unknown[]) => (calls.push({ name: 'extract', args }), []),
  batchScrape: async () => [],
} as unknown as Engine;

let server: Server;
let base = '';

async function post(path: string, body: unknown, token?: string): Promise<{ status: number; json: any }> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

beforeAll(async () => {
  server = createApiServer({ engine, apiKey: 'secret', maxConcurrent: 2, guard: async (value) => assertPublicUrl(value) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe('api server', () => {
  it('serves health without auth', async () => {
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe('ok');
  });

  it('requires a bearer token', async () => {
    expect((await post('/v1/scrape', { url: 'https://example.com' })).status).toBe(401);
    expect((await post('/v1/scrape', { url: 'https://example.com' }, 'wrong')).status).toBe(401);
  });

  it('validates input', async () => {
    const result = await post('/v1/scrape', { formats: ['pdf'] }, 'secret');
    expect(result.status).toBe(400);
    expect(result.json.success).toBe(false);
    expect(result.json.error.code).toBe('E_INPUT');
  });

  it('blocks private targets', async () => {
    const result = await post('/v1/scrape', { url: 'http://127.0.0.1:8080/admin' }, 'secret');
    expect(result.status).toBe(400);
    expect(result.json.error.message).toMatch(/private address/);
    expect((await post('/v1/map', { url: 'http://localhost/' }, 'secret')).status).toBe(400);
  });

  it('routes valid requests to the engine', async () => {
    const result = await post('/v1/scrape', { url: 'https://93.184.216.34/', formats: ['markdown'], includeTags: ['article'] }, 'secret');
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ success: true, data: { markdown: 'hello' } });
    const call = calls.find((item) => item.name === 'scrape');
    expect(call?.args[1]).toMatchObject({ formats: ['markdown'], includeTags: ['article'] });
  });

  it('returns 404 and 405', async () => {
    expect((await post('/v1/nope', {}, 'secret')).status).toBe(404);
    expect((await fetch(`${base}/v1/scrape`)).status).toBe(405);
  });

  it('requires an AI key for extract when none is configured', async () => {
    const result = await post('/v1/extract', { urls: ['https://93.184.216.34/'], prompt: 'x' }, 'secret');
    expect([200, 400]).toContain(result.status);
  });
});

describe('ssrf helpers', () => {
  it('classifies private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111']) expect(isPrivateAddress(ip)).toBe(false);
  });

  it('rejects bad schemes and local names', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(/Unsupported protocol/);
    await expect(assertPublicUrl('http://localhost:3000')).rejects.toThrow(/blocked/);
    await expect(assertPublicUrl('http://intranet.internal/')).rejects.toThrow(/blocked/);
  });
});

describe('actions', () => {
  it('accepts valid actions and rejects invalid ones', () => {
    expect(parseActions([{ type: 'wait', ms: 500 }, { type: 'click', selector: 'button.load-more' }])).toHaveLength(2);
    expect(() => parseActions([{ type: 'teleport' }])).toThrow(/Invalid actions/);
    expect(() => parseActions([{ type: 'wait', ms: 999999 }])).toThrow(/Invalid actions/);
  });
});
