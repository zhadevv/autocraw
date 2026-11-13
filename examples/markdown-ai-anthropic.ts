import { Autocraw } from '@zhadev/autocraw';
import { writeFile } from 'node:fs/promises';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY first.');

const crawler = new Autocraw({ mode: 'auto' });

try {
  const report = await crawler.discover('your-manga-site.example');
  const result = await crawler.markdown(report, {
    mode: 'ai',
    template: 'seo-audit',
    ai: { provider: 'anthropic', apiKey, maxOutputTokens: 8000 },
  });
  await writeFile('seo-audit.ai.md', result.markdown, 'utf8');
} finally {
  await crawler.close();
}
