import type { FetchResult, HydrationReport, SSRReport, TechStackReport } from '../types';
import type { Session } from './session';
import { analyzeHydration, analyzeRawOnly } from '../browser/hydration-trap';
import { detectSSR } from '../ssr/detector';
import { detectTechStack } from '../techstack/detector';
import { AutocrawError } from '../utils/errors';

export interface InspectResult {
  url: string;
  finalUrl: string;
  status: number;
  via: 'http' | 'browser' | 'both';
  headers: Record<string, string>;
  techstack: TechStackReport;
  ssr: SSRReport;
  hydration: HydrationReport | null;
  network: Array<{ url: string; method: string; status: number; contentType: string }>;
}

export async function inspectPage(session: Session, url: string, compare = false): Promise<InspectResult> {
  const mode = session.config.mode;
  let raw: FetchResult | null = null;
  let rendered: FetchResult | null = null;
  if (mode !== 'browser') raw = await session.fetch(url, { mode: 'http' });
  const needBrowser = mode === 'browser' || compare || (mode === 'auto' && (!raw || raw.blocked || analyzeRawOnly(raw.body, raw.finalUrl).trapped));
  if (needBrowser) {
    try {
      rendered = await session.fetch(url, { mode: 'browser' });
    } catch (error) {
      if (!raw) throw error;
    }
  }
  const primary = rendered && !(rendered.blocked && raw && !raw.blocked) ? rendered : raw;
  if (!primary) throw new AutocrawError('E_NETWORK', `Could not fetch ${url}`, { url });
  if (primary.blocked) throw new AutocrawError('E_BLOCKED', `Access blocked (${primary.blockReason ?? 'unknown'}) at ${url}`, { url, reason: primary.blockReason });
  const hydration = raw && rendered && !raw.blocked ? analyzeHydration(raw.body, rendered.body, primary.finalUrl) : raw ? analyzeRawOnly(raw.body, primary.finalUrl) : null;
  const ssr = detectSSR(raw && !raw.blocked ? raw.body : primary.body, primary.finalUrl);
  const headers = raw && !raw.blocked ? raw.headers : primary.headers;
  const techstack = detectTechStack({ url: primary.finalUrl, html: primary.body, headers, hydration, network: primary.network, ssr });
  return {
    url,
    finalUrl: primary.finalUrl,
    status: primary.status,
    via: raw && rendered ? 'both' : primary.via,
    headers,
    techstack,
    ssr,
    hydration,
    network: primary.network.filter((entry) => entry.resourceType === 'xhr' || entry.resourceType === 'fetch').map((entry) => ({ url: entry.url, method: entry.method, status: entry.status, contentType: entry.contentType })).slice(0, 40),
  };
}
