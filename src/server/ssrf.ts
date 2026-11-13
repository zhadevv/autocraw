import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AutocrawError } from '../utils/errors';

function ipv4Private(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return a >= 224;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4Private(ip);
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return ipv4Private(mapped[1] as string);
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (mappedHex) {
      const high = Number.parseInt(mappedHex[1] as string, 16);
      const low = Number.parseInt(mappedHex[2] as string, 16);
      return ipv4Private(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
  }
  return false;
}

export async function assertPublicUrl(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AutocrawError('E_INPUT', `Invalid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AutocrawError('E_INPUT', `Unsupported protocol: ${url.protocol}`);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new AutocrawError('E_INPUT', `Requests to ${host} are blocked because the server only fetches public addresses.`);
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new AutocrawError('E_INPUT', `Requests to private address ${host} are blocked.`);
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch (error) {
    throw new AutocrawError('E_NETWORK', `Cannot resolve host ${host}`, { host }, error);
  }
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) throw new AutocrawError('E_INPUT', `Host ${host} resolves to a private address and is blocked.`);
  }
}

export function createUrlGuard(ttlMs = 30000): (url: string) => Promise<void> {
  const cache = new Map<string, { at: number; pending: Promise<void> }>();
  return (url: string): Promise<void> => {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return assertPublicUrl(url);
    }
    const now = Date.now();
    const hit = cache.get(host);
    if (hit && now - hit.at < ttlMs) return hit.pending;
    const pending = assertPublicUrl(url);
    cache.set(host, { at: now, pending });
    pending.catch(() => cache.delete(host));
    return pending;
  };
}
