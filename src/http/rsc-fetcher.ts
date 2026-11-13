import type { HttpClient } from './client';
import { parseFlight } from '../ssr/parsers';
import { AutocrawError } from '../utils/errors';

export interface RscFetchResult {
  url: string;
  status: number;
  contentType: string;
  isFlight: boolean;
  chunks: number;
  rows: Array<{ id: string; tag: string; value: unknown }>;
  raw: string;
}

export async function fetchRsc(client: HttpClient, url: string, referer?: string): Promise<RscFetchResult> {
  const result = await client.get(url, {
    referer,
    headers: {
      rsc: '1',
      accept: 'text/x-component, */*;q=0.8',
      'next-router-state-tree': encodeURIComponent(JSON.stringify(['', { children: ['__PAGE__', {}] }, null, null, true])),
    },
  });
  if (result.status >= 400) throw new AutocrawError('E_HTTP', `RSC request failed with status ${result.status}`, { url, status: result.status });
  const isFlight = /text\/x-component/i.test(result.contentType) || /^[0-9a-f]+:[A-Z\["{]/m.test(result.body.slice(0, 400));
  const rows = isFlight ? parseFlight(result.body) : [];
  return { url: result.finalUrl, status: result.status, contentType: result.contentType, isFlight, chunks: rows.length, rows, raw: result.body };
}
