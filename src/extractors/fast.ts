import * as rusteerio from 'rusteerio';
import type { LinkInfo } from '../types';
import { absUrl, clean } from '../utils/dom';
import { normalizeUrl, sameSite } from '../utils/normalize-url';

export interface FastPage {
  title: string | null;
  links: LinkInfo[];
}

export function fastExtract(html: string, baseUrl: string): FastPage | null {
  try {
    const $ = rusteerio.load(html);
    const title = clean($('title').first().text()) || null;
    const seen = new Set<string>();
    const links: LinkInfo[] = [];
    const anchors = $('a[href]');
    anchors.each(function (index: number) {
      const node = anchors.eq(index);
      const abs = absUrl(node.attr('href'), baseUrl);
      if (!abs) return;
      const normalized = normalizeUrl(abs) ?? abs;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      const text = clean(node.text()) || clean(node.attr('title')) || clean(node.find('img').first().attr('alt'));
      links.push({ url: normalized, text: text.slice(0, 200), rel: node.attr('rel') ?? '', internal: sameSite(normalized, baseUrl) });
    });
    return { title, links };
  } catch {
    return null;
  }
}
