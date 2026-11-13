# Site templates

A template teaches autocraw how a specific theme or CMS lays out listings, detail pages, episode pages and URLs. autocraw scores every registered template against the home page and uses the best one when its confidence is at least 0.5. Otherwise it falls back to the generic template.

## Built in

| Id | Name | Vendor | Content |
| --- | --- | --- | --- |
| `wordpress-animestream` | AnimeStream | Themesia | Anime |
| `wordpress-madara` | Madara | MangaBooth | Manga, with the WP-Manga core plugin |
| `generic` | Generic | autocraw | Heuristics for any site |

Selectors were checked against AnimeStream 2.2.6 and Madara 2.2.5.2. Forks, child themes and heavily customized sites can differ. Force a template with `--template <id>`.

### AnimeStream

- Listing cards: `article.bs` with `.tt`, `.typez`, `.epx`, `.sb`.
- Series detail: `.bigcontent`, `.infox` fields, `.genxed`, episode list `.eplister`.
- Episode pages: `.megavid`, mirrors in `select.mirror`. Mirror values are usually base64 encoded iframe markup and are decoded.
- URL shape: series at `/anime/{slug}/`, episodes as posts at the site root, genres at `/genres/{slug}/`, search at `/?s=`. The theme registers a `v` rewrite endpoint for mirrors. Custom permalinks change these.

### Madara

- Archive cards: `.page-item-detail`, search cards: `.c-tabs-item__content`.
- Series detail: `.profile-manga`, `.post-content_item` pairs, `.genres-content`.
- Chapters: `li.wp-manga-chapter`. When the list is lazy loaded, autocraw calls `POST {series}/ajax/chapters/?t=1`.
- Reader: `.reading-content` images, with `data-src` preferred over placeholder `src`.
- URL shape: `/manga/{slug}/`, `/manga/{slug}/{chapter}/`, `/manga-genre/{slug}/`, search `/?s=&post_type=wp-manga`. The post type slug and taxonomy slugs are configurable in WP-Manga settings.

## What a template provides

A template implements `SiteTemplate`:

| Member | Purpose |
| --- | --- |
| `id`, `name`, `vendor`, `family`, `contentType` | Identity |
| `detect(ctx)` | Confidence from 0 to 1 for a page |
| `classify(url)` | Page kind for a URL, or null to defer |
| `patterns(base)` | Documented URL patterns for reports |
| `extractListing`, `extractDetail`, `extractChapters`, `extractWatch`, `extractRead` | Parse pages from a DOM `Document` |
| `searchUrl`, `listUrl` | Build search and listing URLs |

## Writing your own

Extend `GenericTemplate` and override what differs.

```ts
import { Autocraw, GenericTemplate } from '@zhadev/autocraw';
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
const report = await crawler.discover('my-site.example');
```

Registering an id twice throws. Use a unique id. Keep `detect` cheap and conservative: a false positive on another site is worse than a miss. Add tests with small HTML fixtures, as in `tests/unit/templates.test.ts`.
