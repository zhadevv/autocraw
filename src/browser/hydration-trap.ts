import type { HydrationReport } from '../types';
import { parseHtml } from '../utils/dom';

const ROOT_SELECTORS = ['[id="root"]', '[id="app"]', '[id="__next"]', '[id="__nuxt"]', '[id="___gatsby"]', '[id="svelte"]', 'app-root'];

export function visibleStats(doc: Document): { text: number; links: number; emptyRoot: boolean; noscript: boolean } {
  const clone = doc.documentElement.cloneNode(true) as Element;
  clone.querySelectorAll('script, style, noscript, template, svg').forEach((node) => node.remove());
  const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim().length;
  const links = clone.querySelectorAll('a[href]').length;
  let emptyRoot = false;
  for (const selector of ROOT_SELECTORS) {
    const root = clone.querySelector(selector);
    if (root && (root.textContent ?? '').replace(/\s+/g, '').length < 20 && root.querySelectorAll('a, img, h1, h2, p').length === 0) {
      emptyRoot = true;
      break;
    }
  }
  const noscript = Array.from(doc.querySelectorAll('noscript')).some((node) => /enable javascript|requires javascript|javascript is required/i.test(node.textContent ?? ''));
  return { text, links, emptyRoot, noscript };
}

export function analyzeRawOnly(rawHtml: string, url = 'about:blank'): HydrationReport {
  const stats = visibleStats(parseHtml(rawHtml, url));
  const reasons: string[] = [];
  if (stats.emptyRoot) reasons.push('Root container is empty in the raw HTML (client-side rendered shell).');
  if (stats.noscript) reasons.push('noscript block asks the visitor to enable JavaScript.');
  if (stats.text < 200) reasons.push(`Raw HTML contains only ${stats.text} characters of visible text.`);
  return {
    trapped: stats.emptyRoot || (stats.noscript && stats.text < 400),
    rawTextLength: stats.text,
    renderedTextLength: stats.text,
    rawLinkCount: stats.links,
    renderedLinkCount: stats.links,
    textRatio: 1,
    linkRatio: 1,
    emptyRoot: stats.emptyRoot,
    reasons,
  };
}

export function analyzeHydration(rawHtml: string, renderedHtml: string, url = 'about:blank'): HydrationReport {
  const raw = visibleStats(parseHtml(rawHtml, url));
  const rendered = visibleStats(parseHtml(renderedHtml, url));
  const textRatio = rendered.text === 0 ? 1 : Math.min(1, raw.text / rendered.text);
  const linkRatio = rendered.links === 0 ? 1 : Math.min(1, raw.links / rendered.links);
  const reasons: string[] = [];
  let trapped = false;
  if (raw.emptyRoot) {
    trapped = true;
    reasons.push('Root container is empty in the raw HTML but populated after JavaScript execution.');
  }
  if (rendered.text >= 300 && textRatio < 0.35) {
    trapped = true;
    reasons.push(`Raw HTML exposes only ${(textRatio * 100).toFixed(0)}% of the rendered text (${raw.text} of ${rendered.text} characters).`);
  }
  if (rendered.links >= 10 && linkRatio < 0.3) {
    trapped = true;
    reasons.push(`Raw HTML exposes only ${raw.links} of ${rendered.links} links found after rendering.`);
  }
  if (!trapped && reasons.length === 0) reasons.push('Raw HTML already contains the content visible after rendering.');
  return {
    trapped,
    rawTextLength: raw.text,
    renderedTextLength: rendered.text,
    rawLinkCount: raw.links,
    renderedLinkCount: rendered.links,
    textRatio: Number(textRatio.toFixed(3)),
    linkRatio: Number(linkRatio.toFixed(3)),
    emptyRoot: raw.emptyRoot,
    reasons,
  };
}
