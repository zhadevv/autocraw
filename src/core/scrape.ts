import type { BrowserAction, ScrapeOptions, ScrapeResult } from '../types';
import type { Session } from './session';
import { extractImages } from '../extractors/images';
import { extractLinks } from '../extractors/links';
import { extractSeo } from '../extractors/seo';
import { htmlToMarkdown, visibleText } from '../extractors/text';
import { AutocrawError } from '../utils/errors';
import { parseHtml } from '../utils/dom';

export async function scrapePage(session: Session, url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const formats = new Set(options.formats ?? ['markdown']);
  const actions: BrowserAction[] = [...(options.waitFor ? [{ type: 'wait' as const, ms: options.waitFor }] : []), ...(options.actions ?? [])];
  const result = await session.fetch(url, {
    mode: options.mode,
    waitForSelector: options.waitForSelector,
    actions: actions.length > 0 ? actions : undefined,
    screenshot: formats.has('screenshot') ? (options.fullPage ? 'full' : 'viewport') : undefined,
  });
  if (result.blocked) throw new AutocrawError('E_BLOCKED', `Access blocked (${result.blockReason ?? 'unknown'}) at ${url}`, { url, reason: result.blockReason });
  if (result.status >= 400) throw new AutocrawError('E_HTTP', `HTTP ${result.status} for ${url}`, { url, status: result.status });
  const doc = parseHtml(result.body, result.finalUrl);
  const output: ScrapeResult = { url, finalUrl: result.finalUrl, status: result.status, via: result.via };
  if (formats.has('markdown')) {
    output.markdown = htmlToMarkdown(doc, result.finalUrl, options.onlyMainContent ?? true, { includeTags: options.includeTags, excludeTags: options.excludeTags });
  }
  if (formats.has('html')) output.html = result.body;
  if (formats.has('text')) output.text = visibleText(doc);
  if (formats.has('links')) output.links = extractLinks(doc, result.finalUrl);
  if (formats.has('images')) output.images = extractImages(doc, result.finalUrl);
  if (formats.has('metadata')) output.metadata = extractSeo(doc, result.finalUrl);
  if (formats.has('screenshot') && result.screenshot) output.screenshot = result.screenshot;
  return output;
}
