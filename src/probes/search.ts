import type { SearchInfo, SiteTemplate } from '../types';
import type { Session } from '../core/session';
import { absUrl, parseHtml } from '../utils/dom';
import { toMessage } from '../utils/errors';

export const SEARCH_FIELD = 'input[name="s"], input[name="q"], input[name="query"], input[name="search"], input[name="keyword"], input[name="k"], input[type="search"]';
const LIVE_SEARCH = /ajaxyLiveSearch|live-?search|search_?ajax|ajax_?search|autocomplete/i;

export function pickSampleQuery(titles: string[]): string {
  for (const title of titles) {
    const word = title.split(/[\s:\-–—,.!?()\[\]]+/).find((part) => part.length >= 4 && /^[\p{L}\p{N}]+$/u.test(part));
    if (word) return word.toLowerCase();
  }
  return 'one';
}

export async function probeSearch(session: Session, template: SiteTemplate, doc: Document, pageUrl: string, titles: string[]): Promise<SearchInfo> {
  const notes: string[] = [];
  const base = new URL(pageUrl);
  const html = doc.documentElement.outerHTML;
  const liveSearch = LIVE_SEARCH.test(html);
  const sampleQuery = pickSampleQuery(titles);

  let method: 'GET' | 'POST' = 'GET';
  let action: string | null = null;
  let param: string | null = null;
  const extraParams: Record<string, string> = {};

  for (const form of Array.from(doc.querySelectorAll('form'))) {
    const field = form.querySelector(SEARCH_FIELD);
    if (!field) continue;
    param = field.getAttribute('name') ?? 's';
    method = (form.getAttribute('method') ?? 'get').toUpperCase() === 'POST' ? 'POST' : 'GET';
    action = absUrl(form.getAttribute('action'), pageUrl) ?? `${base.origin}/`;
    for (const hidden of Array.from(form.querySelectorAll('input[type="hidden"][name]'))) {
      const name = hidden.getAttribute('name');
      if (name && name !== param) extraParams[name] = hidden.getAttribute('value') ?? '';
    }
    break;
  }

  let sampleUrl: string | null = null;
  if (!param) {
    sampleUrl = template.searchUrl(base, sampleQuery);
    action = `${base.origin}/`;
    param = 's';
    notes.push('No search form found in the markup; using the template search URL as a guess.');
  } else if (method === 'GET') {
    const url = new URL(action ?? `${base.origin}/`);
    url.searchParams.set(param, sampleQuery);
    for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, value);
    sampleUrl = url.toString();
  }

  let resultCount = 0;
  let verified = false;
  try {
    const result =
      method === 'POST' && action
        ? await session.fetch(action, { method: 'POST', body: new URLSearchParams({ ...extraParams, [param]: sampleQuery }).toString(), referer: pageUrl })
        : await session.fetch(sampleUrl as string, { referer: pageUrl });
    if (result.status < 400) {
      const resultDoc = parseHtml(result.body, result.finalUrl);
      resultCount = template.extractListing(resultDoc, result.finalUrl).length;
      verified = resultCount > 0;
      if (!verified) notes.push(`Search for "${sampleQuery}" returned no recognizable result cards.`);
    } else {
      notes.push(`Search request returned HTTP ${result.status}.`);
    }
  } catch (error) {
    notes.push(`Search verification failed: ${toMessage(error)}`);
  }
  if (liveSearch) notes.push('A live (AJAX) search script is present on the page.');
  return { detected: true, method, action, param, extraParams, sampleUrl, sampleQuery, resultCount, verified, liveSearch, notes };
}
