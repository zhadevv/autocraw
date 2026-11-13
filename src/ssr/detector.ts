import type { SSRKind, SSRPayload, SSRReport } from '../types';
import { parseHtml } from '../utils/dom';
import { parseAstro, parseNextData, parseNextFlight, parseNuxt2, parseNuxt3, parseQwik, parseRemix, parseSvelteKit } from './parsers';

export function detectSSR(input: string | Document, url = 'about:blank'): SSRReport {
  const doc = typeof input === 'string' ? parseHtml(input, url) : input;
  const parsers = [parseNextData, parseNextFlight, parseNuxt3, parseNuxt2, parseRemix, parseSvelteKit, parseAstro, parseQwik];
  const payloads: SSRPayload[] = [];
  for (const parser of parsers) {
    try {
      const payload = parser(doc);
      if (payload) payloads.push(payload);
    } catch {
      continue;
    }
  }
  const detected: SSRKind[] = payloads.length === 0 ? ['none'] : [...new Set(payloads.map((payload) => payload.kind))];
  return { detected, payloads };
}
