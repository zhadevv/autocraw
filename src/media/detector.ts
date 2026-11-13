import type { MediaReport, MediaSource } from '../types';
import { absUrl, decodeBase64, firstAttr, parseHtml, resolveAny } from '../utils/dom';
import { detectEncryption, unpackPacker } from './encryption';
import { identifyHoster } from './hoster-registry';

const MEDIA_URL = /https?:\\?\/\\?\/[^"'\s<>)]+?\.(m3u8|mpd|mp4|webm|mkv)(?:\?[^"'\s<>\\)]*)?/gi;

function kindFromExtension(ext: string): MediaSource['kind'] {
  switch (ext.toLowerCase()) {
    case 'm3u8':
      return 'hls';
    case 'mpd':
      return 'dash';
    case 'mp4':
      return 'mp4';
    case 'webm':
      return 'webm';
    default:
      return 'source';
  }
}

function pushSource(map: Map<string, MediaSource>, source: MediaSource): void {
  const existing = map.get(source.url);
  if (!existing) {
    map.set(source.url, source);
    return;
  }
  if (!existing.label && source.label) existing.label = source.label;
  if (!existing.hoster && source.hoster) existing.hoster = source.hoster;
}

function srcFromEmbedMarkup(markup: string): string | null {
  const match = /<(?:iframe|embed|video|source)[^>]+(?:src|data-src)=["']([^"']+)["']/i.exec(markup);
  return match?.[1] ?? null;
}

export function decodeMirrorValue(value: string): { url: string | null; encoded: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return { url: null, encoded: false };
  if (/^https?:|^\/\//i.test(trimmed)) return { url: trimmed, encoded: false };
  if (trimmed.startsWith('<')) return { url: srcFromEmbedMarkup(trimmed), encoded: false };
  const decoded = decodeBase64(trimmed);
  if (decoded) {
    const inner = decoded.trim().startsWith('<') ? srcFromEmbedMarkup(decoded) : /^https?:|^\/\//i.test(decoded.trim()) ? decoded.trim() : null;
    if (inner) return { url: inner, encoded: true };
  }
  return { url: null, encoded: false };
}

export function detectMedia(html: string, baseUrl: string, doc?: Document, manifests: string[] = []): MediaReport {
  const document = doc ?? parseHtml(html, baseUrl);
  const found = new Map<string, MediaSource>();

  for (const el of Array.from(document.querySelectorAll('iframe, embed'))) {
    const raw = firstAttr(el, ['src', 'data-src', 'data-lazy-src', 'data-litespeed-src']);
    const url = raw ? resolveAny(raw, baseUrl) : null;
    if (!url || /^about:/i.test(url)) continue;
    pushSource(found, { url, kind: el.tagName.toLowerCase() === 'iframe' ? 'iframe' : 'embed', origin: 'dom', hoster: identifyHoster(url), label: el.getAttribute('title'), encoded: false });
  }

  for (const el of Array.from(document.querySelectorAll('video, audio'))) {
    const raw = firstAttr(el, ['src', 'data-src']);
    const url = raw ? absUrl(raw, baseUrl) : null;
    if (url) pushSource(found, { url, kind: 'video', origin: 'dom', hoster: identifyHoster(url), label: null, encoded: false });
  }

  for (const el of Array.from(document.querySelectorAll('source[src], source[data-src]'))) {
    const url = absUrl(firstAttr(el, ['src', 'data-src']), baseUrl);
    if (!url) continue;
    const ext = /\.(m3u8|mpd|mp4|webm|mkv)(?:\?|$)/i.exec(url)?.[1];
    pushSource(found, { url, kind: ext ? kindFromExtension(ext) : 'source', origin: 'dom', hoster: identifyHoster(url), label: el.getAttribute('label') ?? el.getAttribute('title') ?? el.getAttribute('size'), encoded: false });
  }

  for (const el of Array.from(document.querySelectorAll('track[src]'))) {
    const url = absUrl(el.getAttribute('src'), baseUrl);
    if (url) pushSource(found, { url, kind: 'track', origin: 'dom', hoster: null, label: el.getAttribute('label') ?? el.getAttribute('srclang'), encoded: false });
  }

  for (const el of Array.from(document.querySelectorAll('select option[value], [data-video], [data-embed], [data-player], [data-src-embed]'))) {
    const value = firstAttr(el, ['value', 'data-video', 'data-embed', 'data-player', 'data-src-embed']);
    if (!value) continue;
    const decoded = decodeMirrorValue(value);
    if (!decoded.url) continue;
    const url = resolveAny(decoded.url, baseUrl);
    if (!url) continue;
    const optionLabel = (el.textContent ?? '').trim() || null;
    pushSource(found, { url, kind: 'iframe', origin: decoded.encoded ? 'base64-option' : 'option', hoster: identifyHoster(url, optionLabel), label: optionLabel, encoded: decoded.encoded });
  }

  for (const meta of Array.from(document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]'))) {
    const url = absUrl(meta.getAttribute('content'), baseUrl);
    if (url) pushSource(found, { url, kind: 'embed', origin: 'opengraph', hoster: identifyHoster(url), label: null, encoded: false });
  }

  for (const el of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(el.textContent ?? 'null') as unknown;
      const visit = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(visit);
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        const rawType = record['@type'];
        const types = (Array.isArray(rawType) ? rawType : [rawType]).filter((item): item is string => typeof item === 'string');
        const mediaType = types.some((item) => /video|audio|clip|movie|episode/i.test(item)) && !types.some((item) => /image/i.test(item));
        for (const key of ['contentUrl', 'embedUrl']) {
          const value = record[key];
          if (typeof value === 'string' && mediaType) {
            const url = absUrl(value, baseUrl);
            if (url) pushSource(found, { url, kind: key === 'embedUrl' ? 'embed' : 'video', origin: 'json-ld', hoster: identifyHoster(url), label: typeof record.name === 'string' ? record.name : null, encoded: false });
          }
        }
        Object.values(record).forEach(visit);
      };
      visit(data);
    } catch {
      continue;
    }
  }

  const scriptBlobs: string[] = [];
  for (const el of Array.from(document.querySelectorAll('script:not([src])'))) {
    const text = el.textContent ?? '';
    if (!text) continue;
    scriptBlobs.push(text);
    const packed = unpackPacker(text);
    if (packed) scriptBlobs.push(packed.unpacked);
  }
  for (const blob of scriptBlobs) {
    MEDIA_URL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MEDIA_URL.exec(blob)) !== null) {
      const url = absUrl(match[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&'), baseUrl);
      if (!url) continue;
      pushSource(found, { url, kind: kindFromExtension(match[1] as string), origin: 'script', hoster: identifyHoster(url), label: null, encoded: false });
    }
  }

  for (const el of Array.from(document.querySelectorAll('a[href]'))) {
    const href = absUrl(el.getAttribute('href'), baseUrl);
    if (!href) continue;
    const hoster = identifyHoster(href);
    if (hoster && /download|dl|unduh/i.test(`${el.textContent ?? ''} ${el.className} ${href}`)) {
      pushSource(found, { url: href, kind: 'download', origin: 'dom', hoster, label: (el.textContent ?? '').trim().slice(0, 80) || null, encoded: false });
    } else if (/\.(?:mp4|mkv|webm)(?:\?|$)/i.test(href)) {
      pushSource(found, { url: href, kind: 'download', origin: 'dom', hoster, label: (el.textContent ?? '').trim().slice(0, 80) || null, encoded: false });
    }
  }

  const sources = [...found.values()];
  const hosters = [...new Set(sources.map((source) => source.hoster).filter((name): name is string => Boolean(name)))];
  return { sources, encryption: detectEncryption({ html: `${html}\n${scriptBlobs.join('\n')}`, manifests }), hosters };
}
