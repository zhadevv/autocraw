import { InvalidArgumentError } from 'commander';

export const SCRAPE_FORMATS = ['markdown', 'html', 'text', 'links', 'images', 'metadata', 'screenshot'] as const;
export type ScrapeFormat = (typeof SCRAPE_FORMATS)[number];

export function parseFormats(value: string, previous: ScrapeFormat[] = []): ScrapeFormat[] {
  const result = [...previous];
  for (const part of value.split(',')) {
    const name = part.trim().toLowerCase();
    if (!name) continue;
    if (!(SCRAPE_FORMATS as readonly string[]).includes(name)) {
      throw new InvalidArgumentError(`Unknown format "${name}". Choose from: ${SCRAPE_FORMATS.join(', ')}.`);
    }
    if (!result.includes(name as ScrapeFormat)) result.push(name as ScrapeFormat);
  }
  return result;
}
