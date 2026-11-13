import { GenericTemplate, Autocraw } from '@zhadev/autocraw';
import type { PageKind, SiteTemplate, TemplateContext } from '@zhadev/autocraw';

class MySiteTemplate extends GenericTemplate implements SiteTemplate {
  override id = 'my-site';
  override name = 'My Site';
  override vendor = 'me';

  override detect(ctx: TemplateContext): number {
    return ctx.doc.querySelector('body.my-site') ? 1 : 0;
  }

  override classify(url: URL): PageKind | null {
    return url.pathname.startsWith('/series/') ? 'detail' : null;
  }
}

const crawler = new Autocraw();
crawler.registerTemplate(new MySiteTemplate());
await crawler.close();
