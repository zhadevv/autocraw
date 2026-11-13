import { describe, expect, it } from 'vitest';
import { fastExtract } from '../../src/extractors/fast';
import { extractLinks } from '../../src/extractors/links';
import { parseHtml } from '../../src/utils/dom';

const html = `<html><head><title> Fast  Page </title></head><body>
<a href="/a/">Alpha</a><a href="/a/#frag">Alpha again</a><a href="https://other.test/x" rel="nofollow">Other</a>
<a href="javascript:void(0)">Nope</a><a href="/img/"><img src="/i.png" alt="Pic"></a><a href="mailto:x@y.z">Mail</a>
</body></html>`;

describe('fastExtract', () => {
  it('matches the jsdom link extractor', () => {
    const base = 'https://site.test/';
    const fast = fastExtract(html, base);
    expect(fast).not.toBeNull();
    const slow = extractLinks(parseHtml(html, base), base);
    expect(fast?.title).toBe('Fast Page');
    expect(fast?.links.map((link) => link.url)).toEqual(slow.map((link) => link.url));
    expect(fast?.links.map((link) => link.internal)).toEqual(slow.map((link) => link.internal));
    expect(fast?.links.find((link) => link.url.endsWith('/img/'))?.text).toBe('Pic');
  });
});
