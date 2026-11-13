import type { SelectorReport } from '../classify/selector-finder';
import { findSelectors } from '../classify/selector-finder';
import type { Session } from './session';
import { AutocrawError } from '../utils/errors';
import { ensureUrl } from '../utils/normalize-url';

export interface SelectorsResult {
  home: SelectorReport;
  extra: Array<{ url: string; report: SelectorReport }>;
}

export async function findPageSelectors(session: Session, url: string, extraUrls: string[] = []): Promise<SelectorsResult> {
  const start = ensureUrl(url);
  const { result, doc } = await session.document(start);
  if (result.blocked) throw new AutocrawError('E_BLOCKED', `Access blocked (${result.blockReason ?? 'unknown'}) at ${start}`, { url: start, reason: result.blockReason });
  if (result.status >= 400) throw new AutocrawError('E_HTTP', `HTTP ${result.status} for ${start}`, { url: start, status: result.status });
  const home = findSelectors(doc, result.finalUrl);
  const extra: SelectorsResult['extra'] = [];
  for (const raw of extraUrls) {
    try {
      const page = await session.document(ensureUrl(raw), { referer: result.finalUrl });
      if (page.result.status < 400 && !page.result.blocked) extra.push({ url: page.result.finalUrl, report: findSelectors(page.doc, page.result.finalUrl) });
    } catch {
      continue;
    }
  }
  return { home, extra };
}
