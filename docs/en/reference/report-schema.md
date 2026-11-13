# Report schema

`discover` returns a `SiteReport`. `schemaVersion` is `1`. Fields may be added within a version; existing fields keep their meaning. A breaking change increases `schemaVersion`.

| Field | Type | Description |
| --- | --- | --- |
| `schemaVersion` | `1` | Schema version |
| `target`, `origin` | string | Requested URL and its origin |
| `generatedAt`, `version` | string | ISO time and autocraw version |
| `home` | object | `url`, `status`, `title`, `via`, `seo` of the home page |
| `techstack` | object | `technologies`, `primaryFramework`, `cms`, `renderStrategy`, `renderReasons`, `dataFormat`, `dataReasons` |
| `ssr` | object | `detected` kinds and `payloads` with `kind`, `source`, `sizeBytes`, `keys`, `data`, `meta` |
| `hydration` | object or null | Raw versus rendered text and link counts, `trapped`, `reasons` |
| `template` | object or null | `id`, `name`, `vendor`, `confidence`, `contentType` |
| `robots` | object | `found`, `sitemaps`, `crawlDelay`, `disallowAll`, `disallowed`, `allowed` |
| `sitemap` | object | `found`, `sources`, `totalUrls`, `sample`, `groups` |
| `urlGroups` | array | `pattern`, `kind`, `count`, `examples` |
| `patterns` | array | Template documented URL patterns |
| `listing` | array | Items found on the home page |
| `pagination` | object or null | `scheme`, `pattern`, `current`, `last`, `next`, `verified`, `notes` |
| `search` | object or null | `method`, `action`, `param`, `sampleUrl`, `resultCount`, `verified`, `liveSearch`, `notes` |
| `filters` | object or null | `action`, `method`, `controls` with options |
| `detail` | object or null | Sample detail page: `url` and `info` |
| `watch` | object or null | Sample episode page: mirrors, default player, downloads, navigation, media |
| `read` | object or null | Sample reader page: image pages, navigation |
| `media` | object or null | `sources`, `encryption`, `hosters` |
| `network` | array | Observed XHR and fetch endpoints, only after a browser render |
| `crawl` | object or null | Pages, skipped URLs, errors, stats |
| `caveats` | string[] | Things that could not be verified |
| `timings` | object | Milliseconds per step |

`renderStrategy`: `ssr`, `ssg`, `csr`, `rsc`, `hybrid`, `unknown`.
`dataFormat`: `html-only`, `json-hydration`, `rsc-flight`, `graphql`, `rest-json`, `mixed`, `unknown`.
Page kinds: `home`, `listing`, `search`, `detail`, `watch`, `read`, `taxonomy`, `static`, `feed`, `asset`, `other`.

Treat `null` as "not probed or not applicable", and read `caveats` to learn why.
