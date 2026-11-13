import { Autocraw } from '@zhadev/autocraw';

const crawler = new Autocraw({ mode: 'auto' });

try {
  const page = await crawler.scrape('example.com', { formats: ['markdown', 'links', 'metadata'] });
  console.log(page.markdown);
  console.log(`${page.links?.length ?? 0} links, fetched via ${page.via}`);
} finally {
  await crawler.close();
}
