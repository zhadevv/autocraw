import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { detectKinds, leadingZeroBits, listResolvers, solvePowToken } from '../../src/resolver';
import { humanPath, turnstileSitekey } from '../../src/resolver/shared';

const V3_KEY = '6LcBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ENTERPRISE_KEY = '6LcEeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const POW_TOKEN = 'A'.repeat(48) + 'B'.repeat(16);

function input(html: string, title = '', frameUrls: string[] = []) {
  return { html, title, frameUrls };
}

describe('detectKinds', () => {
  it('detects a turnstile widget and reads its sitekey', () => {
    const page = input('<div class="cf-turnstile" data-sitekey="0x4AAAAAAA"></div>');
    expect(turnstileSitekey(page)).toBe('0x4AAAAAAA');
    expect(detectKinds(page)).toEqual(['cloudflare-turnstile']);
  });

  it('reads a turnstile sitekey from the challenge iframe', () => {
    const page = input('<iframe src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x?sitekey=0x4BBBB&hl=en"></iframe>');
    expect(turnstileSitekey(page)).toBe('0x4BBBB');
  });

  it('detects a cloudflare interstitial from the title', () => {
    expect(detectKinds(input('<html></html>', 'Just a moment...'))).toEqual(['cloudflare-challenges']);
  });

  it('does not treat the challenge platform script alone as an interstitial', () => {
    expect(detectKinds(input('<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'))).toEqual([]);
  });

  it('detects recaptcha v2 from the anchor frame', () => {
    const page = input('<textarea name="g-recaptcha-response"></textarea>', '', ['https://www.google.com/recaptcha/api2/anchor?k=1']);
    expect(detectKinds(page)).toEqual(['recaptcha-v2']);
  });

  it('prefers enterprise over v2 when enterprise.js is loaded', () => {
    const page = input(`<script src="https://www.google.com/recaptcha/enterprise.js?render=${ENTERPRISE_KEY}"></script><div class="g-recaptcha" data-sitekey="${ENTERPRISE_KEY}"></div>`);
    expect(detectKinds(page)).toEqual(['recaptcha-enterprise']);
  });

  it('detects recaptcha v3 from the render parameter', () => {
    expect(detectKinds(input(`<script src="https://www.google.com/recaptcha/api.js?render=${V3_KEY}"></script>`))).toEqual(['recaptcha-v3']);
  });

  it('ignores api.js without a render key', () => {
    expect(detectKinds(input('<script src="https://www.google.com/recaptcha/api.js"></script>'))).toEqual([]);
  });

  it('detects geetest v4 from the widget script', () => {
    expect(detectKinds(input('<script src="https://static.geetest.com/v4/gt4.js"></script>'))).toEqual(['geetest']);
  });

  it('detects geetest v3 from initGeetest and the frame url', () => {
    expect(detectKinds(input('<script>initGeetest({}, function (captcha) {})</script>'))).toEqual(['geetest']);
    expect(detectKinds(input('<html></html>', '', ['https://static.geetest.com/static/tools/iqij0h/index.html']))).toEqual(['geetest']);
  });

  it('detects aws waf from the challenge script', () => {
    expect(detectKinds(input('<script src="https://abc123.awswaf.com/abc123/jsapi.js"></script>'))).toEqual(['aws-waf']);
  });

  it('detects a wobble widget', () => {
    expect(detectKinds(input('<div class="wc-stage"><div class="wc-slider"><div class="wc-thumb"></div></div></div>'))).toEqual(['wobble']);
  });

  it('detects a powblock challenge page', () => {
    expect(detectKinds(input('<html></html>', 'POWBlock Check…'))).toEqual(['powblock']);
    expect(detectKinds(input(`<div id="c">${POW_TOKEN}</div><div id="d">18</div><div id="h">256</div>`))).toEqual(['powblock']);
  });
});

describe('humanPath', () => {
  it('starts and ends at the requested points', () => {
    const path = humanPath({ x: 10, y: 20 }, { x: 300, y: 120 }, 12);
    expect(path).toHaveLength(13);
    expect(Math.abs(path[0].x - 10)).toBeLessThanOrEqual(1);
    expect(Math.abs(path[0].y - 20)).toBeLessThanOrEqual(1);
    expect(path[12].x).toBe(300);
    expect(path[12].y).toBe(120);
  });
});

describe('registry', () => {
  it('lists the built-in resolvers in detection order', () => {
    expect(listResolvers()).toEqual([
      'cloudflare-challenges',
      'cloudflare-turnstile',
      'recaptcha-v2',
      'recaptcha-enterprise',
      'recaptcha-v3',
      'geetest',
      'aws-waf',
      'wobble',
      'powblock',
    ]);
  });
});

describe('powblock', () => {
  it('counts leading zero bits', () => {
    expect(leadingZeroBits(Buffer.from([0x00, 0x0f, 0xff]))).toBe(12);
    expect(leadingZeroBits(Buffer.from([0x80, 0x00]))).toBe(0);
    expect(leadingZeroBits(Buffer.from([0x00, 0x00, 0x01]))).toBe(23);
  });

  it('mines a nonce that satisfies the declared difficulty', () => {
    const token = 'pow-test-token';
    const solution = solvePowToken(token, 4, 256, 5000);
    expect(solution).not.toBeNull();
    if (!solution) return;
    expect(leadingZeroBits(Buffer.from(solution.digest, 'hex'))).toBeGreaterThanOrEqual(4);
    expect(createHash('sha256').update(token + String(solution.nonce)).digest('hex')).toBe(solution.digest);
  });
});
