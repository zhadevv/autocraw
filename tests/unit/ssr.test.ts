import { describe, expect, it } from 'vitest';
import { detectSSR } from '../../src/ssr/detector';
import { parseFlight, unflattenDevalue } from '../../src/ssr/parsers';

describe('ssr detection', () => {
  it('parses __NEXT_DATA__', () => {
    const html = '<html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"title":"Hi"}},"page":"/","buildId":"abc","gsp":true}</script></body></html>';
    const report = detectSSR(html);
    expect(report.detected).toEqual(['next-pages']);
    expect(report.payloads[0]?.meta.buildId).toBe('abc');
    expect(report.payloads[0]?.keys).toEqual(['title']);
  });

  it('parses RSC flight chunks', () => {
    const chunk = JSON.stringify([1, '0:["$","div",null,{"children":"x"}]\n1:I["app/page.js",[],"default"]\n']);
    const html = `<html><body><script>self.__next_f.push(${chunk})</script></body></html>`;
    const report = detectSSR(html);
    expect(report.detected).toEqual(['next-app-rsc']);
    expect(report.payloads[0]?.meta.rows).toBe(2);
    expect(report.payloads[0]?.meta.clientModules).toBe(1);
  });

  it('revives devalue payloads for Nuxt 3', () => {
    const payload = JSON.stringify([{ data: 1 }, { posts: 2 }, [3, 4], 'a', 'b']);
    const html = `<html><body><div id="__nuxt"></div><script id="__NUXT_DATA__" type="application/json">${payload}</script></body></html>`;
    const report = detectSSR(html);
    expect(report.detected).toEqual(['nuxt3']);
    expect(report.payloads[0]?.data).toEqual({ data: { posts: ['a', 'b'] } });
  });

  it('evaluates Nuxt 2 IIFE payloads in a sandbox', () => {
    const html = '<html><body><script>window.__NUXT__=(function(a){return {layout:"default",data:[{n:a}]}}(5));</script></body></html>';
    const report = detectSSR(html);
    expect(report.detected).toEqual(['nuxt2']);
    expect(report.payloads[0]?.data).toEqual({ layout: 'default', data: [{ n: 5 }] });
  });

  it('reports none for plain HTML', () => {
    expect(detectSSR('<html><body><p>hello</p></body></html>').detected).toEqual(['none']);
  });

  it('parseFlight and unflattenDevalue handle basic input', () => {
    expect(parseFlight('0:["a"]\n2:I["m",[],"d"]')).toHaveLength(2);
    expect(unflattenDevalue([{ a: 1 }, 'x'])).toEqual({ a: 'x' });
  });
});
