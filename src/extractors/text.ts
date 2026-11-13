import { absUrl, clean, imageUrl } from '../utils/dom';
import { AutocrawError } from '../utils/errors';

const NOISE = 'script, style, noscript, template, svg, iframe, canvas, form, button, select, input, textarea';
const CHROME = 'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .sidebar, .widget, .advertisement, .ads, .cookie, .comments, [id="comments"]';
const MAIN_SELECTORS = ['article', 'main', '[role="main"]', '.entry-content', '.post-content', '.article-content', '.content', '[id="content"]', '[id="main"]'];

export function visibleText(doc: Document): string {
  const clone = doc.body ? (doc.body.cloneNode(true) as Element) : (doc.documentElement.cloneNode(true) as Element);
  clone.querySelectorAll(NOISE).forEach((node) => node.remove());
  return clean(clone.textContent);
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

export function pickMainElement(root: Element): Element {
  let best: Element | null = null;
  let bestLength = 0;
  for (const selector of MAIN_SELECTORS) {
    for (const candidate of Array.from(root.querySelectorAll(selector))) {
      const length = clean(candidate.textContent).length;
      if (length > bestLength) {
        best = candidate;
        bestLength = length;
      }
    }
    if (best && bestLength > 400) break;
  }
  const total = clean(root.textContent).length;
  if (best && bestLength >= Math.min(300, total * 0.3)) return best;
  return root;
}

interface WalkContext {
  base: string;
  listStack: Array<{ ordered: boolean; index: number }>;
  inPre: boolean;
  inLink: boolean;
}

const BLOCK_TAGS = new Set(['div', 'section', 'article', 'main', 'figure', 'figcaption', 'details', 'summary', 'dl', 'dt', 'dd', 'address', 'center']);

function inlineChildren(node: Node, ctx: WalkContext): string {
  let out = '';
  node.childNodes.forEach((child) => {
    out += walk(child, ctx);
  });
  return out;
}

function walk(node: Node, ctx: WalkContext): string {
  if (node.nodeType === 3) {
    const value = node.textContent ?? '';
    if (ctx.inPre) return value;
    return value.replace(/\s+/g, ' ');
  }
  if (node.nodeType !== 1) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const fence = '`'.repeat(3);
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = clean(inlineChildren(el, ctx));
      if (ctx.inLink) return text ? ` ${text} ` : '';
      return text ? `\n\n${'\u0023'.repeat(Number(tag[1]))} ${text}\n\n` : '';
    }
    case 'p': {
      const text = inlineChildren(el, ctx).trim();
      if (ctx.inLink) return text ? ` ${text} ` : '';
      return text ? `\n\n${text}\n\n` : '';
    }
    case 'br':
      return '  \n';
    case 'hr':
      return '\n\n---\n\n';
    case 'a': {
      const text = clean(inlineChildren(el, { ...ctx, inLink: true }));
      const href = absUrl(el.getAttribute('href'), ctx.base);
      if (!text) return '';
      return href ? `[${text}](${href})` : text;
    }
    case 'img': {
      const src = imageUrl(el, ctx.base);
      if (!src) return '';
      return `![${clean(el.getAttribute('alt'))}](${src})`;
    }
    case 'strong':
    case 'b': {
      const text = inlineChildren(el, ctx).trim();
      return text ? `**${text}**` : '';
    }
    case 'em':
    case 'i': {
      const text = inlineChildren(el, ctx).trim();
      return text ? `*${text}*` : '';
    }
    case 'del':
    case 's': {
      const text = inlineChildren(el, ctx).trim();
      return text ? `~~${text}~~` : '';
    }
    case 'code': {
      if (ctx.inPre) return el.textContent ?? '';
      const text = (el.textContent ?? '').trim();
      return text ? '`' + text + '`' : '';
    }
    case 'pre': {
      const codeEl = el.querySelector('code');
      const langMatch = /(?:language|lang)-([\w-]+)/.exec(`${codeEl?.className ?? ''} ${el.className}`);
      const content = (el.textContent ?? '').replace(/\n+$/, '');
      return `\n\n${fence}${langMatch?.[1] ?? ''}\n${content}\n${fence}\n\n`;
    }
    case 'blockquote': {
      const inner = clean(inlineChildren(el, ctx)).length === 0 ? '' : inlineChildren(el, ctx).trim();
      if (!inner) return '';
      return '\n\n' + inner.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n') + '\n\n';
    }
    case 'ul':
    case 'ol': {
      const nested = ctx.listStack.length;
      const frame = { ordered: tag === 'ol', index: 0 };
      ctx.listStack.push(frame);
      const body = inlineChildren(el, ctx);
      ctx.listStack.pop();
      return nested === 0 ? `\n\n${body.replace(/\n{2,}/g, '\n').trim()}\n\n` : `\n${body.replace(/\n{2,}/g, '\n').trimEnd()}`;
    }
    case 'li': {
      const frame = ctx.listStack[ctx.listStack.length - 1] ?? { ordered: false, index: 0 };
      frame.index += 1;
      const indent = '  '.repeat(Math.max(0, ctx.listStack.length - 1));
      const marker = frame.ordered ? `${frame.index}.` : '-';
      const body = inlineChildren(el, ctx).trim().replace(/\n{2,}/g, '\n');
      return body ? `\n${indent}${marker} ${body}` : '';
    }
    case 'table': {
      const rows = Array.from(el.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      const matrix = rows.map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => clean(inlineChildren(cell, ctx)).replace(/\|/g, '\\|')));
      const width = Math.max(...matrix.map((row) => row.length));
      if (width === 0) return '';
      const padded = matrix.map((row) => [...row, ...Array(width - row.length).fill('')]);
      const header = padded[0] as string[];
      const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
      for (const row of padded.slice(1)) lines.push(`| ${row.join(' | ')} |`);
      return `\n\n${lines.join('\n')}\n\n`;
    }
    default: {
      if (el.matches(NOISE)) return '';
      const text = inlineChildren(el, ctx);
      if (ctx.inLink) return ` ${text} `;
      return BLOCK_TAGS.has(tag) ? `\n${text}\n` : text;
    }
  }
}

export interface MarkdownFilters {
  includeTags?: string[];
  excludeTags?: string[];
}

function selectAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch (error) {
    throw new AutocrawError('E_INPUT', `Invalid CSS selector "${selector}"`, { selector }, error);
  }
}

export function htmlToMarkdown(doc: Document, base: string, onlyMainContent = true, filters: MarkdownFilters = {}): string {
  const root = doc.body ? (doc.body.cloneNode(true) as Element) : (doc.documentElement.cloneNode(true) as Element);
  root.querySelectorAll(NOISE).forEach((node) => node.remove());
  for (const selector of filters.excludeTags ?? []) selectAll(root, selector).forEach((node) => node.remove());
  let scope: Element = root;
  if (filters.includeTags && filters.includeTags.length > 0) {
    const container = doc.createElement('div');
    for (const selector of filters.includeTags) {
      for (const node of selectAll(root, selector)) container.appendChild(node.cloneNode(true));
    }
    scope = container;
  } else if (onlyMainContent) {
    root.querySelectorAll(CHROME).forEach((node) => {
      if (!node.querySelector('article, main')) node.remove();
    });
    scope = pickMainElement(root);
  }
  const body = walk(scope, { base, listStack: [], inPre: false, inLink: false });
  const title = clean(doc.querySelector('title')?.textContent);
  const markdown = body
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (markdown && !/^\u0023\s/.test(markdown) && title && onlyMainContent && !filters.includeTags?.length && !doc.querySelector('h1')) {
    return `${'\u0023'} ${title}\n\n${markdown}\n`;
  }
  return markdown ? `${markdown}\n` : '';
}
