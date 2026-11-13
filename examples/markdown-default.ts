import { Autocraw } from '@zhadev/autocraw';
import { writeFile } from 'node:fs/promises';

const crawler = new Autocraw({ mode: 'auto', maxPages: 30 });

try {
  const report = await crawler.discover('your-anime-site.example');
  const result = await crawler.markdown(report, { mode: 'default', template: 'site-structure', language: 'en' });
  await writeFile('site-structure.md', result.markdown, 'utf8');
  console.log('Saved site-structure.md');
} finally {
  await crawler.close();
}
