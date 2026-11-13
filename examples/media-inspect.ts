import { Autocraw } from '@zhadev/autocraw';

const crawler = new Autocraw({ mode: 'auto' });

try {
  const media = await crawler.media('your-anime-site.example/some-episode-1/', true);
  for (const source of media.sources) console.log(source.kind, source.hoster ?? '-', source.url);
  for (const hint of media.encryption) console.log('protection:', hint.type, hint.evidence);
} finally {
  await crawler.close();
}
