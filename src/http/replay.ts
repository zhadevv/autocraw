import type { FetchResult, NetworkEntry } from '../types';
import type { HttpClient } from './client';

const forbidden = new Set(['host', 'content-length', 'connection', 'accept-encoding', 'cookie', 'transfer-encoding']);

export async function replayEntry(client: HttpClient, entry: NetworkEntry, referer?: string): Promise<FetchResult> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry.requestHeaders)) {
    const lower = key.toLowerCase();
    if (forbidden.has(lower) || lower.startsWith(':')) continue;
    headers[lower] = value;
  }
  if (entry.method.toUpperCase() === 'POST' && entry.postData !== null) {
    return client.post(entry.url, entry.postData, { headers, referer });
  }
  return client.get(entry.url, { headers, referer });
}

export function isDataEndpoint(entry: NetworkEntry): boolean {
  if (entry.resourceType !== 'xhr' && entry.resourceType !== 'fetch') return false;
  return /json|x-component|graphql/i.test(entry.contentType) || /graphql|\/api\/|admin-ajax|\.json($|\?)/i.test(entry.url);
}

export function summarizeEndpoints(entries: NetworkEntry[]): Array<{ url: string; method: string; status: number; contentType: string }> {
  const seen = new Set<string>();
  const result: Array<{ url: string; method: string; status: number; contentType: string }> = [];
  for (const entry of entries) {
    if (!isDataEndpoint(entry)) continue;
    const key = `${entry.method} ${entry.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ url: entry.url, method: entry.method, status: entry.status, contentType: entry.contentType });
  }
  return result.slice(0, 40);
}
