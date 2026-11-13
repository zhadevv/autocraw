import { describe, expect, it } from 'vitest';
import { parseHtml } from '../../src/utils/dom';
import { htmlToMarkdown } from '../../src/extractors/text';
import { extractSeo } from '../../src/extractors/seo';
import { extractPagination, detectPageScheme } from '../../src/probes/pagination';

const page = `<html lang="en"><head><title>Hello World Page Title Here</title><meta name="description" content="d"></head><body>
<header><nav><a href="/x">Menu</a></nav></header>
<main><article><h1>Hello</h1><p>Some <strong>bold</strong> and <a href="/a">link</a>.</p><ul><li>One</li><li>Two</li></ul>
<pre><code class="language-js">const a = 1;</code></pre>
<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
<p>${'Filler content to make the article dominant. '.repeat(20)}</p></article></main><footer>Footer</footer></body></html>`;

describe('htmlToMarkdown', () => {
  const md = htmlToMarkdown(parseHtml(page, 'https://x.test/'), 'https://x.test/');
  it('converts structure and drops chrome', () => {
    expect(md).toContain('\u0023 Hello');
    expect(md).toContain('**bold**');
    expect(md).toContain('[link](https://x.test/a)');
    expect(md).toContain('- One');
    expect(md).toContain('| A | B |');
    expect(md).not.toContain('Menu');
    expect(md).not.toContain('Footer');
  });
});

describe('extractSeo', () => {
  it('reports issues', () => {
    const seo = extractSeo(parseHtml(page, 'https://x.test/'), 'https://x.test/');
    expect(seo.h1).toEqual(['Hello']);
    expect(seo.issues).toEqual(expect.arrayContaining(['Meta description is short (1 characters).', 'Missing canonical link.']));
  });
});

describe('pagination', () => {
  it('detects path and query schemes', () => {
    expect(detectPageScheme('https://x.test/anime/page/3/')?.pattern).toBe('https://x.test/anime/page/{n}/');
    expect(detectPageScheme('https://x.test/list?page=4&order=a')?.scheme).toBe('query');
  });

  it('reads pagination markup', () => {
    const html = '<div class="pagination"><span class="page-numbers current">1</span><a class="page-numbers" href="/anime/page/2/">2</a><a class="page-numbers" href="/anime/page/9/">9</a><a class="next page-numbers" href="/anime/page/2/">Next</a></div>';
    const info = extractPagination(parseHtml(html, 'https://x.test/anime/'), 'https://x.test/anime/');
    expect(info).toMatchObject({ detected: true, scheme: 'path', current: 1, last: 9, next: 'https://x.test/anime/page/2/' });
  });
});

describe('links containing headings', () => {
  it('keeps card links on one line without heading marks', () => {
    const html = '<html><body><main><article><a href="/ep-1/"><div class="bt"><span>Ep 3</span><span>Sub</span></div><img src="/i.jpg" alt=""><div class="tt">Title<h2>Title Episode 3</h2></div></a><p>' + 'More article text to dominate the page. '.repeat(20) + '</p></article></main></body></html>';
    const md = htmlToMarkdown(parseHtml(html, 'https://x.test/'), 'https://x.test/');
    const line = md.split('\n').find((l) => l.includes('/ep-1/')) ?? '';
    expect(line.startsWith('[')).toBe(true);
    expect(line).not.toContain('\u0023\u0023');
    expect(line).toContain('Ep 3 Sub');
  });
});

describe('canonical resolution', () => {
  it('resolves relative canonical links', () => {
    const doc = parseHtml('<html><head><link rel="canonical" href="/"></head><body></body></html>', 'https://x.test/a');
    expect(extractSeo(doc, 'https://x.test/a').canonical).toBe('https://x.test/');
  });
});
