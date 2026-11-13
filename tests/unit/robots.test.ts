import { describe, expect, it } from 'vitest';
import { RobotsPolicy } from '../../src/compliance/robots';

const sample = [
  'User-agent: *',
  'Disallow: /wp-admin/',
  'Allow: /wp-admin/admin-ajax.php',
  'Disallow: /*?s=',
  'Crawl-delay: 2',
  '',
  'User-agent: autocraw',
  'Disallow: /private',
  '',
  'Sitemap: https://example.com/sitemap.xml',
].join('\n');

describe('RobotsPolicy', () => {
  const policy = new RobotsPolicy(sample);

  it('prefers the most specific user-agent group', () => {
    expect(policy.isAllowed('/private/x', 'autocraw')).toBe(false);
    expect(policy.isAllowed('/wp-admin/', 'autocraw')).toBe(true);
  });

  it('applies longest-match with allow winning ties', () => {
    expect(policy.isAllowed('/wp-admin/options.php', 'other-bot')).toBe(false);
    expect(policy.isAllowed('/wp-admin/admin-ajax.php', 'other-bot')).toBe(true);
  });

  it('supports wildcards', () => {
    expect(policy.isAllowed('/?s=naruto', 'other-bot')).toBe(false);
    expect(policy.isAllowed('/anime/', 'other-bot')).toBe(true);
  });

  it('exposes crawl delay and sitemaps', () => {
    expect(policy.crawlDelay('other-bot')).toBe(2);
    expect(policy.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });

  it('treats empty robots as allow-all', () => {
    expect(new RobotsPolicy('').isAllowed('/anything')).toBe(true);
  });
});
