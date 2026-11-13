import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeBrowserPath, expandHome, resolveBrowserExecutable } from '../../src/utils/paths';
import { parseFormats } from '../../src/cli/parsers/formats';

describe('browser path helpers', () => {
  it('expands the home directory', () => {
    expect(expandHome('~/tools/chrome')).toBe(join(homedir(), 'tools/chrome'));
    expect(expandHome('/abs/chrome')).toBe('/abs/chrome');
  });

  it('finds the binary inside a directory and strips quotes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autocraw-'));
    mkdirSync(join(dir, 'chrome-root'));
    const binary = join(dir, 'chrome-root', 'chrome');
    writeFileSync(binary, 'x');
    expect(resolveBrowserExecutable(`"${join(dir, 'chrome-root')}"`)).toBe(binary);
    expect(describeBrowserPath(binary)).toBeNull();
  });

  it('describes bad paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autocraw-'));
    expect(describeBrowserPath(dir)).toMatch(/directory without/);
    expect(describeBrowserPath(join(dir, 'missing'))).toMatch(/does not exist/);
  });
});

describe('scrape formats', () => {
  it('accepts comma separated and repeated values without duplicates', () => {
    expect(parseFormats('markdown,links')).toEqual(['markdown', 'links']);
    expect(parseFormats('links', ['markdown'])).toEqual(['markdown', 'links']);
    expect(parseFormats('markdown', ['markdown'])).toEqual(['markdown']);
  });

  it('rejects unknown formats', () => {
    expect(() => parseFormats('pdf')).toThrow(/Unknown format/);
  });
});
