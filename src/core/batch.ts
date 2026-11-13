import type { BatchItem, ScrapeOptions } from '../types';
import type { Session } from './session';
import { scrapePage } from './scrape';
import { isAutocrawError, toMessage } from '../utils/errors';
import { ensureUrl } from '../utils/normalize-url';

export interface BatchOptions {
  scrape?: ScrapeOptions;
  concurrency?: number;
  onItem?: (item: BatchItem, index: number, total: number) => void;
  signal?: AbortSignal;
}

export async function batchScrape(session: Session, urls: string[], options: BatchOptions = {}): Promise<BatchItem[]> {
  const unique = [...new Set(urls.map((value) => value.trim()).filter(Boolean))];
  const results: BatchItem[] = new Array(unique.length);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? session.config.concurrency, 32));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (options.signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= unique.length) return;
      const raw = unique[index] as string;
      let item: BatchItem;
      try {
        const url = ensureUrl(raw);
        const data = await scrapePage(session, url, options.scrape);
        item = { url, ok: true, data };
      } catch (error) {
        item = { url: raw, ok: false, error: { code: isAutocrawError(error) ? error.code : 'E_UNKNOWN', message: toMessage(error) } };
      }
      results[index] = item;
      options.onItem?.(item, index, unique.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(unique.length, 1)) }, () => worker()));
  return results.filter((item): item is BatchItem => item !== undefined);
}
