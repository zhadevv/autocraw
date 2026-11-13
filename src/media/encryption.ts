import type { EncryptionHint } from '../types';

export interface UnpackResult {
  unpacked: string;
  rounds: number;
}

const PACKER = /eval\(function\(p,a,c,k,e,(?:d|r)\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)(?:,\s*\d+\s*,\s*(?:\{\}|\[\]|\w+)\s*\)\))?/;

function baseEncode(value: number, radix: number): string {
  const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const head = value < radix ? '' : baseEncode(Math.floor(value / radix), radix);
  const rest = value % radix;
  return head + (rest > 35 ? String.fromCharCode(rest + 29) : digits[rest]);
}

export function unpackPacker(source: string): UnpackResult | null {
  let current = source;
  let rounds = 0;
  for (let i = 0; i < 6; i += 1) {
    const match = PACKER.exec(current);
    if (!match) break;
    const payload = (match[1] as string).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const radix = Number(match[2]);
    const count = Number(match[3]);
    const dictionary = (match[4] as string).split('|');
    if (!Number.isFinite(radix) || radix < 2 || radix > 62 || !Number.isFinite(count)) break;
    const lookup = new Map<string, string>();
    for (let index = count - 1; index >= 0; index -= 1) {
      const word = dictionary[index];
      lookup.set(baseEncode(index, radix), word ? word : baseEncode(index, radix));
    }
    const unpacked = payload.replace(/\b\w+\b/g, (token) => lookup.get(token) ?? token);
    current = current.replace(match[0], unpacked);
    rounds += 1;
  }
  return rounds === 0 ? null : { unpacked: current, rounds };
}

export function detectEncryption(texts: { html: string; manifests?: string[] }): EncryptionHint[] {
  const hints: EncryptionHint[] = [];
  const add = (hint: EncryptionHint): void => {
    if (!hints.some((existing) => existing.type === hint.type)) hints.push(hint);
  };
  for (const manifest of texts.manifests ?? []) {
    const key = /#EXT-X-(?:SESSION-)?KEY:([^\n]+)/i.exec(manifest);
    if (key) {
      const line = key[1] as string;
      if (/METHOD=AES-128/i.test(line)) add({ type: 'hls-aes-128', evidence: `#EXT-X-KEY ${line.slice(0, 120)}` });
      else if (/METHOD=SAMPLE-AES/i.test(line)) add({ type: 'hls-sample-aes', evidence: `#EXT-X-KEY ${line.slice(0, 120)}` });
      if (/widevine/i.test(line)) add({ type: 'drm-widevine', evidence: line.slice(0, 120) });
      if (/fairplay|streamingkeydelivery/i.test(line)) add({ type: 'drm-fairplay', evidence: line.slice(0, 120) });
    }
  }
  const html = texts.html;
  if (/eval\(function\(p,a,c,k,e,(?:d|r)\)/.test(html)) add({ type: 'packed-js', evidence: 'Dean Edwards packer (eval(function(p,a,c,k,e,d)))' });
  if (/CryptoJS\.(?:AES|enc|DES)|crypto-js|AES\.decrypt/i.test(html)) add({ type: 'cryptojs', evidence: 'CryptoJS or AES.decrypt referenced in scripts' });
  if (/var _0x[a-f0-9]{4,6}\s*=\s*\[|_0x[a-f0-9]{4,6}\(0x[a-f0-9]+\)/.test(html)) add({ type: 'obfuscated-js', evidence: 'javascript-obfuscator style identifiers (_0x...)' });
  if (/com\.widevine\.alpha|widevine/i.test(html)) add({ type: 'drm-widevine', evidence: 'Widevine key system referenced' });
  if (/com\.microsoft\.playready|playready/i.test(html)) add({ type: 'drm-playready', evidence: 'PlayReady key system referenced' });
  if (/com\.apple\.fps|fairplay/i.test(html)) add({ type: 'drm-fairplay', evidence: 'FairPlay key system referenced' });
  if (/<option[^>]+value="[A-Za-z0-9+_\-=]{40,}"/.test(html) && /class="[^"]*mirror/.test(html)) add({ type: 'base64-embed', evidence: 'Mirror options carry base64 encoded iframe markup' });
  if (/[?&](?:token|expires|signature|sig|hash|md5)=[A-Za-z0-9_\-%.]{10,}/i.test(html) && /\.(?:m3u8|mp4|mpd)/i.test(html)) add({ type: 'token-url', evidence: 'Media URLs carry signed token/expiry parameters' });
  return hints;
}
