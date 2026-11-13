import type { SeoReport } from '../types';
import { clean, resolveAny } from '../utils/dom';
import { sameSite } from '../utils/normalize-url';
import { collectMetaMap, jsonLdTypes, metaContent } from './meta';
import { countWords, visibleText } from './text';

export function extractSeo(doc: Document, pageUrl: string): SeoReport {
  const title = clean(doc.querySelector('title')?.textContent) || null;
  const description = metaContent(doc, 'meta[name="description" i]');
  const canonicalRaw = doc.querySelector('link[rel="canonical" i]')?.getAttribute('href')?.trim() || null;
  const canonical = canonicalRaw ? resolveAny(canonicalRaw, pageUrl) ?? canonicalRaw : null;
  const robots = metaContent(doc, 'meta[name="robots" i]');
  const lang = doc.documentElement.getAttribute('lang');
  const viewport = metaContent(doc, 'meta[name="viewport" i]');
  const h1 = Array.from(doc.querySelectorAll('h1')).map((el) => clean(el.textContent)).filter(Boolean);
  const headingCount: Record<string, number> = {};
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const count = doc.querySelectorAll(`h${level}`).length;
    if (count > 0) headingCount[`h${level}`] = count;
  }
  const images = Array.from(doc.querySelectorAll('img'));
  const imagesMissingAlt = images.filter((img) => !(img.getAttribute('alt') ?? '').trim()).length;
  let internalLinks = 0;
  let externalLinks = 0;
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href') ?? '';
    if (!href || /^(javascript|mailto|tel):/i.test(href) || href === '#') continue;
    try {
      const abs = new URL(href, pageUrl).toString();
      if (sameSite(abs, pageUrl)) internalLinks += 1;
      else externalLinks += 1;
    } catch {
      continue;
    }
  }
  const hreflang = Array.from(doc.querySelectorAll('link[rel="alternate"][hreflang]'))
    .map((el) => ({ lang: el.getAttribute('hreflang') ?? '', href: el.getAttribute('href') ?? '' }))
    .filter((item) => item.lang && item.href);
  const wordCount = countWords(visibleText(doc));

  const issues: string[] = [];
  if (!title) issues.push('Missing <title>.');
  else if (title.length < 15) issues.push(`Title is very short (${title.length} characters).`);
  else if (title.length > 65) issues.push(`Title is long (${title.length} characters); it may be truncated in search results.`);
  if (!description) issues.push('Missing meta description.');
  else if (description.length < 70) issues.push(`Meta description is short (${description.length} characters).`);
  else if (description.length > 170) issues.push(`Meta description is long (${description.length} characters).`);
  if (h1.length === 0) issues.push('No <h1> found.');
  else if (h1.length > 1) issues.push(`Multiple <h1> elements (${h1.length}).`);
  if (!canonical) issues.push('Missing canonical link.');
  if (!lang) issues.push('Missing lang attribute on <html>.');
  if (!viewport) issues.push('Missing viewport meta tag.');
  if (robots && /noindex/i.test(robots)) issues.push('Page is marked noindex.');
  if (images.length > 0 && imagesMissingAlt > 0) issues.push(`${imagesMissingAlt} of ${images.length} images have no alt text.`);
  if (wordCount < 100) issues.push(`Thin content (${wordCount} words).`);

  return {
    title,
    titleLength: title?.length ?? 0,
    description,
    descriptionLength: description?.length ?? 0,
    canonical,
    robots,
    lang,
    viewport,
    h1,
    headingCount,
    openGraph: collectMetaMap(doc, 'property', 'og:'),
    twitter: collectMetaMap(doc, 'name', 'twitter:'),
    jsonLdTypes: jsonLdTypes(doc),
    hreflang,
    imagesTotal: images.length,
    imagesMissingAlt,
    internalLinks,
    externalLinks,
    wordCount,
    issues,
  };
}
