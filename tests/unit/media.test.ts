import { describe, expect, it } from 'vitest';
import { detectMedia, decodeMirrorValue } from '../../src/media/detector';
import { detectEncryption, unpackPacker } from '../../src/media/encryption';
import { identifyHoster } from '../../src/media/hoster-registry';

describe('media', () => {
  it('decodes base64 mirror options', () => {
    const value = Buffer.from('<iframe src="https://streamwish.to/e/abc123" allowfullscreen></iframe>').toString('base64');
    expect(decodeMirrorValue(value)).toEqual({ url: 'https://streamwish.to/e/abc123', encoded: true });
  });

  it('identifies hosters', () => {
    expect(identifyHoster('https://streamwish.to/e/abc')).toBe('Streamwish');
    expect(identifyHoster('https://www.mp4upload.com/embed-x.html')).toBe('Mp4upload');
    expect(identifyHoster('https://unknown.example/x')).toBeNull();
  });

  it('collects iframes, mirrors and script sources', () => {
    const mirror = Buffer.from('<iframe src="https://filemoon.sx/e/zzz"></iframe>').toString('base64');
    const html = `<html><body><div class="video-content"><iframe src="https://www.mp4upload.com/embed-1.html"></iframe></div><select class="mirror"><option value="">Select</option><option value="${mirror}">Moon</option></select><script>var f = "https:\\/\\/cdn.example.com\\/v\\/index.m3u8?token=abcdefghij";</script></body></html>`;
    const report = detectMedia(html, 'https://site.test/ep-1/');
    expect(report.sources.some((s) => s.hoster === 'Mp4upload' && s.kind === 'iframe')).toBe(true);
    expect(report.sources.some((s) => s.hoster === 'Filemoon' && s.encoded)).toBe(true);
    expect(report.sources.some((s) => s.kind === 'hls')).toBe(true);
    expect(report.hosters).toEqual(expect.arrayContaining(['Mp4upload', 'Filemoon']));
  });

  it('unpacks Dean Edwards packed scripts', () => {
    const packed = "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1=\"2\";',3,3,'var|file|https_x'.split('|'),0,{}))";
    const result = unpackPacker(packed);
    expect(result?.unpacked).toContain('var file="https_x";');
  });

  it('flags HLS AES keys and packers', () => {
    const hints = detectEncryption({ html: 'eval(function(p,a,c,k,e,d){})', manifests: ['#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k.key"'] });
    expect(hints.map((h) => h.type)).toEqual(expect.arrayContaining(['hls-aes-128', 'packed-js']));
  });
});

describe('media json-ld', () => {
  it('ignores ImageObject contentUrl but keeps VideoObject', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'ImageObject', contentUrl: 'https://s.test/logo.png' }, { '@type': 'VideoObject', name: 'Ep', embedUrl: 'https://rumble.com/embed/v1/' }] })}</script></head><body></body></html>`;
    const report = detectMedia(html, 'https://s.test/');
    expect(report.sources.some((s) => s.url.endsWith('logo.png'))).toBe(false);
    expect(report.sources.some((s) => s.hoster === 'Rumble')).toBe(true);
  });

  it('knows more hosters', () => {
    expect(identifyHoster('https://player.abyssplayer.com/abc')).toBe('AbyssPlayer');
    expect(identifyHoster('https://play.d.tube/?v=1')).toBe('D.Tube');
    expect(identifyHoster('https://vidara.to/e/x')).toBe('Vidara');
  });
});
