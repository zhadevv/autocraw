import { Autocraw } from '@zhadev/autocraw';
import { writeFile } from 'node:fs/promises';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Set OPENAI_API_KEY first.');

const crawler = new Autocraw({ mode: 'auto' });

try {
  const report = await crawler.discover('your-anime-site.example');
  const result = await crawler.markdown(report, {
    mode: 'ai',
    template: 'site-structure',
    language: 'id',
    ai: { provider: 'openai', apiKey, model: 'gpt-4.1', fallbackToDefault: true },
  });
  await writeFile('site-structure.ai.md', result.markdown, 'utf8');
  console.log(`cached=${result.cached} fallback=${result.usedFallback} tokens=${result.inputTokens}/${result.outputTokens}`);
  result.warnings.forEach((warning: string) => console.warn(warning));
} finally {
  await crawler.close();
}
