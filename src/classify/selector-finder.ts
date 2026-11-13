import type { FilterInfo } from '../types';
import { absUrl, clean, textOf } from '../utils/dom';
import { decodeMirrorValue } from '../media/detector';
import { identifyHoster, hosterKind } from '../media/hoster-registry';
import { extractFilters } from '../probes/filter';
import { PAGINATION_CONTAINERS } from '../probes/pagination';
import { SEARCH_FIELD } from '../probes/search';

const CLASS_TOKEN = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

export interface ElementHit {
  selector: string;
  count: number;
  sample: Record<string, string | null>;
}

export interface SelectorReport {
  url: string;
  title: ElementHit | null;
  heading: ElementHit | null;
  cards: Array<ElementHit & { titleSelector: string | null; linkSelector: string | null; imageSelector: string | null }>;
  pagination: { containerSelector: string; nextSelector: string | null; prevSelector: string | null } | null;
  search: { formSelector: string | null; inputSelector: string } | null;
  filters: Array<{ selector: string; type: string; optionCount: number }>;
  media: {
    iframeSelector: ElementHit | null;
    mirrorSelectSelector: ElementHit | null;
    downloadLinkSelectors: ElementHit[];
  };
  attributePairs: ElementHit | null;
}

function classesOf(el: Element): string[] {
  return Array.from(el.classList).filter((cls) => CLASS_TOKEN.test(cls));
}

export function selectorOf(el: Element): string {
  const id = el.getAttribute('id');
  if (id && CLASS_TOKEN.test(id)) return `${el.tagName.toLowerCase()}#${id}`;
  const classes = classesOf(el);
  const tag = el.tagName.toLowerCase();
  return classes.length > 0 ? `${tag}.${classes.slice(0, 2).join('.')}` : tag;
}

function groupKey(el: Element): string | null {
  const classes = classesOf(el);
  if (classes.length === 0) return null;
  return `${el.tagName.toLowerCase()}.${[...classes].sort().join('.')}`;
}

function parentSelector(el: Element): string {
  const parent = el.parentElement;
  return parent ? selectorOf(parent) : el.tagName.toLowerCase();
}

export function findRepeatedGroups(doc: Document, minCount = 3, requireLink = true): Array<{ selector: string; elements: Element[] }> {
  const groups = new Map<string, Element[]>();
  for (const el of Array.from(doc.querySelectorAll('body *'))) {
    const key = groupKey(el);
    if (!key) continue;
    if (requireLink && !el.querySelector('a[href]') && el.tagName.toLowerCase() !== 'a') continue;
    const list = groups.get(key) ?? [];
    list.push(el);
    groups.set(key, list);
  }
  const result: Array<{ selector: string; elements: Element[] }> = [];
  for (const [key, elements] of groups) {
    if (elements.length < minCount) continue;
    const nested = elements.some((el) => elements.some((other) => other !== el && other.contains(el)));
    if (nested) continue;
    const parts = key.split('.');
    const selector = `${parts[0]}.${parts.slice(1).join('.')}`;
    result.push({ selector, elements });
  }
  return result.sort((a, b) => b.elements.length - a.elements.length);
}

function commonDescendantSelectors(a: Element, b: Element): string[] {
  const aKeys = new Set(Array.from(a.querySelectorAll('*')).map((el) => groupKey(el)).filter((key): key is string => Boolean(key)));
  const bKeys = new Set(Array.from(b.querySelectorAll('*')).map((el) => groupKey(el)).filter((key): key is string => Boolean(key)));
  return [...aKeys].filter((key) => bKeys.has(key)).map((key) => {
    const parts = key.split('.');
    return `${parts[0]}.${parts.slice(1).join('.')}`;
  });
}

function findRole(card: Element, candidates: string[], predicate: (el: Element) => boolean): string | null {
  for (const selector of candidates) {
    try {
      const found = card.querySelector(selector);
      if (found && predicate(found)) return selector;
    } catch {
      continue;
    }
  }
  return null;
}

export function findCards(doc: Document, base: string): SelectorReport['cards'] {
  const groups = findRepeatedGroups(doc, 3, true).slice(0, 5);
  const cards: SelectorReport['cards'] = [];
  for (const group of groups) {
    const [first, second] = group.elements;
    if (!first) continue;
    const link = first.matches('a[href]') ? first : first.querySelector('a[href]');
    const title = clean(link?.textContent) || clean(first.querySelector('h1,h2,h3,h4')?.textContent) || clean(first.getAttribute('title'));
    if (!title) continue;
    const shared = second ? commonDescendantSelectors(first, second) : [];
    const titleSelector = findRole(first, shared, (el) => clean(el.textContent).length > 0);
    const linkSelector = link ? (first.matches('a[href]') ? null : findRole(first, shared.filter((s) => s.includes('a')), () => true) ?? 'a[href]') : null;
    const imageSelector = first.querySelector('img') ? (findRole(first, shared, (el) => el.tagName.toLowerCase() === 'img') ?? 'img') : null;
    cards.push({
      selector: group.selector,
      count: group.elements.length,
      sample: { title, url: absUrl(link?.getAttribute('href'), base) },
      titleSelector,
      linkSelector,
      imageSelector,
    });
    if (cards.length >= 3) break;
  }
  return cards;
}

export function findPaginationSelectors(doc: Document, base: string): SelectorReport['pagination'] {
  const container = doc.querySelector(PAGINATION_CONTAINERS);
  if (!container) return null;
  const next = Array.from(container.querySelectorAll('a[href]')).find((a) => /next|»|›|>/i.test(a.textContent ?? '') || /next/i.test(a.getAttribute('rel') ?? ''));
  const prev = Array.from(container.querySelectorAll('a[href]')).find((a) => /prev|«|‹|</i.test(a.textContent ?? '') || /prev/i.test(a.getAttribute('rel') ?? ''));
  return {
    containerSelector: selectorOf(container),
    nextSelector: next ? `${selectorOf(container)} a[href="${next.getAttribute('href')}"]` : null,
    prevSelector: prev ? `${selectorOf(container)} a[href="${prev.getAttribute('href')}"]` : null,
  };
}

export function findSearchSelector(doc: Document): SelectorReport['search'] {
  const field = doc.querySelector(SEARCH_FIELD);
  if (!field) return null;
  const name = field.getAttribute('name');
  const inputSelector = name ? `input[name="${name}"]` : selectorOf(field);
  const form = field.closest('form');
  return { formSelector: form ? selectorOf(form) : null, inputSelector };
}

export function filtersToSelectors(filters: FilterInfo): SelectorReport['filters'] {
  return filters.controls.map((control) => ({
    selector: control.type === 'select' ? `select[name="${control.name}"]` : `input[name="${control.name}"]`,
    type: control.type,
    optionCount: control.options.length,
  }));
}

export function findMediaSelectors(doc: Document): SelectorReport['media'] {
  const iframes = Array.from(doc.querySelectorAll('iframe[src], iframe[data-src]'));
  let iframeSelector: ElementHit | null = null;
  if (iframes.length > 0) {
    const first = iframes[0] as Element;
    const container = first.closest('[class]');
    const selector = container && container !== first ? `${selectorOf(container)} iframe` : 'iframe[src]';
    iframeSelector = { selector, count: iframes.length, sample: { src: first.getAttribute('src') ?? first.getAttribute('data-src') } };
  }
  let mirrorSelectSelector: ElementHit | null = null;
  for (const select of Array.from(doc.querySelectorAll('select'))) {
    const options = Array.from(select.querySelectorAll('option'));
    const decoded = options.find((option) => decodeMirrorValue(option.getAttribute('value') ?? '').url);
    if (decoded) {
      mirrorSelectSelector = { selector: selectorOf(select), count: options.length, sample: { firstOptionLabel: textOf(options[0]) } };
      break;
    }
  }
  const downloadGroups = new Map<string, Element[]>();
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href') ?? '';
    const hoster = identifyHoster(href, anchor.textContent);
    if (!hoster || hosterKind(hoster) !== 'download') continue;
    const key = parentSelector(anchor);
    const list = downloadGroups.get(key) ?? [];
    list.push(anchor);
    downloadGroups.set(key, list);
  }
  const downloadLinkSelectors: ElementHit[] = [...downloadGroups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([selector, elements]) => ({ selector: `${selector} a[href]`, count: elements.length, sample: { href: elements[0]?.getAttribute('href') ?? null, text: clean(elements[0]?.textContent) } }));
  return { iframeSelector, mirrorSelectSelector, downloadLinkSelectors };
}

export function findAttributePairs(doc: Document): SelectorReport['attributePairs'] {
  const groups = new Map<string, Array<{ key: string; value: string }>>();
  for (const label of Array.from(doc.querySelectorAll('b, strong, h5, dt'))) {
    const text = clean(label.textContent);
    if (!text || text.length > 30) continue;
    const key = text.replace(/:\s*$/, '');
    const parent = label.parentElement;
    if (!parent) continue;
    const full = clean(parent.textContent);
    const value = clean(full.slice(full.indexOf(text) + text.length).replace(/^:\s*/, ''));
    if (!value) continue;
    const container = parent.parentElement;
    const containerSelector = container ? selectorOf(container) : parentSelector(parent);
    const list = groups.get(containerSelector) ?? [];
    list.push({ key, value });
    groups.set(containerSelector, list);
  }
  let best: [string, Array<{ key: string; value: string }>] | null = null;
  for (const entry of groups) if (!best || entry[1].length > best[1].length) best = entry;
  if (!best || best[1].length < 2) return null;
  const sample: Record<string, string> = {};
  for (const pair of best[1].slice(0, 4)) sample[pair.key] = pair.value.slice(0, 60);
  return { selector: `${best[0]} b, ${best[0]} strong`, count: best[1].length, sample };
}

export function findSelectors(doc: Document, url: string): SelectorReport {
  const titleEl = doc.querySelector('title');
  const h1 = doc.querySelector('h1');
  const filters = extractFilters(doc, url);
  return {
    url,
    title: titleEl ? { selector: 'title', count: 1, sample: { text: clean(titleEl.textContent) } } : null,
    heading: h1 ? { selector: selectorOf(h1), count: doc.querySelectorAll(selectorOf(h1)).length, sample: { text: clean(h1.textContent) } } : null,
    cards: findCards(doc, url),
    pagination: findPaginationSelectors(doc, url),
    search: findSearchSelector(doc),
    filters: filters.detected ? filtersToSelectors(filters) : [],
    media: findMediaSelectors(doc),
    attributePairs: findAttributePairs(doc),
  };
}
