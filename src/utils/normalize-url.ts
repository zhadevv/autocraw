const trackingParams = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', 'ref', 'ref_src', '_ga', '_gl',
]);

export interface NormalizeOptions {
  stripTracking?: boolean;
  stripHash?: boolean;
  sortQuery?: boolean;
  stripTrailingSlash?: boolean;
  stripWww?: boolean;
}

export function normalizeUrl(input: string, base?: string, options: NormalizeOptions = {}): string | null {
  const { stripTracking = true, stripHash = true, sortQuery = true, stripTrailingSlash = false, stripWww = false } = options;
  let url: URL;
  try {
    url = base ? new URL(input, base) : new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hostname = url.hostname.toLowerCase();
  if (stripWww && url.hostname.startsWith('www.')) url.hostname = url.hostname.slice(4);
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = '';
  if (stripHash) url.hash = '';
  if (stripTracking) {
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParams.has(key.toLowerCase())) url.searchParams.delete(key);
    }
  }
  if (sortQuery) url.searchParams.sort();
  let result = url.toString();
  if (stripTrailingSlash && url.pathname.length > 1 && url.pathname.endsWith('/') && !url.search) {
    result = result.replace(/\/+$/, '');
  }
  return result;
}

export function isSameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function sameSite(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, '');
    const hb = new URL(b).hostname.replace(/^www\./, '');
    return ha === hb;
  } catch {
    return false;
  }
}

export function originOf(input: string): string {
  return new URL(input).origin;
}

export function ensureUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('URL is empty');
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https:${'/'.repeat(2)}${trimmed}`;
  const url = new URL(candidate);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Unsupported protocol: ${url.protocol}`);
  return url.toString();
}
