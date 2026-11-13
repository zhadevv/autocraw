import { describe, expect, it } from 'vitest';
import { parseHtml } from '../../src/utils/dom';
import { AnimeStreamTemplate } from '../../src/templates/wordpress/animestream';
import { MadaraTemplate } from '../../src/templates/wordpress/madara';
import { TemplateRegistry } from '../../src/templates/registry';

const base = 'https://anime.test/';

const animeHome = `
<html><head><link rel="stylesheet" href="https://anime.test/wp-content/themes/animestream/style.css"></head>
<body><div class="postbody"><div class="bixbox"><div class="listupd">
<article class="bs"><div class="bsx"><a class="tip" href="https://anime.test/anime/naruto/" rel="101" title="Naruto">
<div class="limit"><div class="typez TV">TV</div><div class="bt"><span class="epx">Ep 12</span><span class="sb Sub">Sub</span></div><img src="https://anime.test/naruto.jpg"></div>
<div class="tt">Naruto<h2 itemprop="headline">Naruto</h2></div></a></div></article>
</div></div></div></body></html>`;

const animeDetail = `
<html><body><div class="bigcontent"><div class="thumbook"><div class="thumb"><img src="https://anime.test/cover.jpg"></div>
<div class="rating"><strong>Rating 8.50</strong></div></div>
<div class="infox"><h1 class="entry-title">Naruto</h1><span class="alter">ナルト</span>
<div class="info-content"><div class="spe"><span><b>Status:</b> Completed</span><span><b>Studio:</b> <a href="/studio/pierrot/">Pierrot</a></span></div>
<div class="genxed"><a href="https://anime.test/genres/action/">Action</a></div></div></div></div>
<div class="bixbox synp"><div class="entry-content" itemprop="description">A ninja story.</div></div>
<div class="eplister"><ul>
<li data-index="0"><a href="https://anime.test/naruto-episode-2/"><div class="epl-num">2</div><div class="epl-title">Episode 2</div><div class="epl-date">Jan 2, 2020</div></a></li>
<li data-index="1"><a href="https://anime.test/naruto-episode-1/"><div class="epl-num">1</div><div class="epl-title">Episode 1</div><div class="epl-date">Jan 1, 2020</div></a></li>
</ul></div></body></html>`;

const mirror = Buffer.from('<iframe src="https://streamwish.to/e/abc"></iframe>').toString('base64');
const animeWatch = `
<html><body><div class="megavid"><h1 class="entry-title">Naruto Episode 1</h1>
<div class="video-content"><iframe src="https://www.mp4upload.com/embed-1.html"></iframe></div>
<select class="mirror"><option value="">Select Video Server</option><option value="${mirror}">Wish</option></select>
<div class="naveps"><div class="nvs"><a href="https://anime.test/naruto-episode-0/">Prev</a></div><div class="nvs nvsc"><a href="https://anime.test/anime/naruto/">All</a></div><div class="nvs"><a href="https://anime.test/naruto-episode-2/">Next</a></div></div>
</div></body></html>`;

describe('AnimeStream template', () => {
  const template = new AnimeStreamTemplate();

  it('detects the theme', () => {
    const doc = parseHtml(animeHome, base);
    expect(template.detect({ url: new URL(base), html: animeHome, doc, headers: {} })).toBeGreaterThanOrEqual(0.5);
  });

  it('extracts listing cards', () => {
    const items = template.extractListing(parseHtml(animeHome, base), base);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: '101', title: 'Naruto', type: 'TV', status: 'Ep 12', badge: 'Sub', url: 'https://anime.test/anime/naruto/' });
  });

  it('extracts detail and episode list', () => {
    const info = template.extractDetail(parseHtml(animeDetail, base), base);
    expect(info?.title).toBe('Naruto');
    expect(info?.attributes.Status).toBe('Completed');
    expect(info?.genres[0]?.name).toBe('Action');
    expect(info?.chapters).toHaveLength(2);
    expect(info?.chapters[0]?.number).toBe('2');
    expect(info?.lastChapter).toBe('https://anime.test/naruto-episode-2/');
  });

  it('extracts mirrors and navigation from watch pages', () => {
    const watch = template.extractWatch(parseHtml(animeWatch, base), 'https://anime.test/naruto-episode-1/');
    expect(watch?.mirrors).toHaveLength(1);
    expect(watch?.mirrors[0]).toMatchObject({ url: 'https://streamwish.to/e/abc', encoded: true });
    expect(watch?.defaultPlayer).toBe('https://www.mp4upload.com/embed-1.html');
    expect(watch?.prev).toBe('https://anime.test/naruto-episode-0/');
    expect(watch?.next).toBe('https://anime.test/naruto-episode-2/');
  });

  it('classifies URLs', () => {
    expect(template.classify(new URL('https://anime.test/anime/naruto/'))).toBe('detail');
    expect(template.classify(new URL('https://anime.test/anime/page/2/'))).toBe('listing');
    expect(template.classify(new URL('https://anime.test/naruto-episode-1-subtitle-indonesia/'))).toBe('watch');
    expect(template.classify(new URL('https://anime.test/genres/action/'))).toBe('taxonomy');
    expect(template.classify(new URL('https://anime.test/?s=naruto'))).toBe('search');
  });
});

const madaraArchive = `
<html><body class="madara"><div class="page-listing-item"><div class="row"><div class="col-6">
<div class="page-item-detail manga"><div class="item-thumb c-image-hover" data-post-id="55"><a href="https://manga.test/manga/one-piece/" title="One Piece"><img data-src="https://manga.test/op.jpg" src="data:image/gif;base64,R0lGOD"></a></div>
<div class="item-summary"><div class="post-title font-title"><h3 class="h5"><span class="manga-title-badges hot">HOT</span><a href="https://manga.test/manga/one-piece/">One Piece</a></h3></div>
<div class="list-chapter"><div class="chapter-item"><span class="chapter font-meta"><a href="https://manga.test/manga/one-piece/chapter-1100/">Chapter 1100</a></span></div></div></div></div>
</div></div></div></body></html>`;

const madaraDetail = `
<html><body class="madara"><div class="profile-manga"><div class="post-title"><h1><span class="manga-title-badges hot">HOT</span> One Piece</h1></div>
<div class="summary_image"><img data-src="https://manga.test/op.jpg"></div>
<div class="post-content_item"><div class="summary-heading"><h5>Alternative</h5></div><div class="summary-content">ワンピース</div></div>
<div class="post-content_item"><div class="summary-heading"><h5>Status</h5></div><div class="summary-content">OnGoing</div></div>
<div class="genres-content"><a href="https://manga.test/manga-genre/action/">Action</a></div>
<div class="description-summary"><div class="summary__content"><p>Pirates.</p></div></div></div>
<ul class="main version-chap no-volumn"><li class="wp-manga-chapter"><a href="https://manga.test/manga/one-piece/chapter-2/">Chapter 2</a><span class="chapter-release-date"><i>June 2, 2024</i></span></li>
<li class="wp-manga-chapter"><a href="https://manga.test/manga/one-piece/chapter-1/">Chapter 1</a><span class="chapter-release-date"><i>June 1, 2024</i></span></li></ul></body></html>`;

const madaraAjaxDetail = `
<html><body class="madara"><div class="profile-manga"><div class="post-title"><h1>Series</h1></div><div class="summary_image"><img src="https://manga.test/a.jpg"></div></div>
<div id="manga-chapters-holder" data-id="77"></div></body></html>`;

const madaraRead = `
<html><body><h1 id="chapter-heading">One Piece - Chapter 1</h1><div class="reading-content"><div class="page-break"><img class="wp-manga-chapter-img" data-src="https://manga.test/c/1.jpg" src="data:image/gif;base64,R0lGOD"></div><div class="page-break"><img class="wp-manga-chapter-img" src="https://manga.test/c/2.jpg"></div></div>
<div class="nav-previous"><a href="https://manga.test/manga/one-piece/chapter-0/" class="btn prev_page">Prev</a></div><div class="nav-next"><a href="https://manga.test/manga/one-piece/chapter-2/" class="btn next_page">Next</a></div>
<select class="single-chapter-select"><option data-redirect="https://manga.test/manga/one-piece/chapter-1/" value="1">Chapter 1</option></select></body></html>`;

describe('Madara template', () => {
  const template = new MadaraTemplate();
  const mbase = 'https://manga.test/';

  it('detects the theme', () => {
    const doc = parseHtml(madaraArchive, mbase);
    expect(template.detect({ url: new URL(mbase), html: madaraArchive, doc, headers: {} })).toBeGreaterThanOrEqual(0.4);
  });

  it('extracts archive cards and prefers lazy image attributes', () => {
    const items = template.extractListing(parseHtml(madaraArchive, mbase), mbase);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: '55', title: 'One Piece', image: 'https://manga.test/op.jpg', latest: 'Chapter 1100', hot: true });
  });

  it('extracts detail info and chapters', () => {
    const info = template.extractDetail(parseHtml(madaraDetail, mbase), 'https://manga.test/manga/one-piece/');
    expect(info?.title).toBe('One Piece');
    expect(info?.attributes.Status).toBe('OnGoing');
    expect(info?.alternative).toBe('ワンピース');
    expect(info?.chapters).toHaveLength(2);
    expect(info?.lastChapter).toBe('https://manga.test/manga/one-piece/chapter-2/');
    expect(info?.ajaxChapters).toBeNull();
  });

  it('reports the AJAX chapter endpoint when the list is lazy loaded', () => {
    const info = template.extractDetail(parseHtml(madaraAjaxDetail, mbase), 'https://manga.test/manga/series/');
    expect(info?.ajaxChapters).toEqual({ endpoint: 'https://manga.test/manga/series/ajax/chapters/?t=1', method: 'POST' });
  });

  it('extracts reader pages and navigation', () => {
    const read = template.extractRead(parseHtml(madaraRead, mbase), 'https://manga.test/manga/one-piece/chapter-1/');
    expect(read?.pages).toEqual(['https://manga.test/c/1.jpg', 'https://manga.test/c/2.jpg']);
    expect(read?.prev).toBe('https://manga.test/manga/one-piece/chapter-0/');
    expect(read?.next).toBe('https://manga.test/manga/one-piece/chapter-2/');
    expect(read?.chapterOptions[0]?.url).toBe('https://manga.test/manga/one-piece/chapter-1/');
  });

  it('classifies URLs', () => {
    expect(template.classify(new URL('https://manga.test/manga/one-piece/'))).toBe('detail');
    expect(template.classify(new URL('https://manga.test/manga/one-piece/chapter-1/'))).toBe('read');
    expect(template.classify(new URL('https://manga.test/manga/one-piece/vol-1/chapter-1/'))).toBe('read');
    expect(template.classify(new URL('https://manga.test/manga/one-piece/ajax/chapters/'))).toBe('feed');
    expect(template.classify(new URL('https://manga.test/manga-genre/action/'))).toBe('taxonomy');
    expect(template.classify(new URL('https://manga.test/?s=one&post_type=wp-manga'))).toBe('search');
  });
});

describe('TemplateRegistry', () => {
  it('picks the right template and falls back to generic', () => {
    const registry = new TemplateRegistry();
    const a = registry.detect({ url: new URL(base), html: animeHome, doc: parseHtml(animeHome, base), headers: {} });
    expect(a.template.id).toBe('wordpress-animestream');
    const blank = '<html><body><p>nothing</p></body></html>';
    const g = registry.detect({ url: new URL(base), html: blank, doc: parseHtml(blank, base), headers: {} });
    expect(g.template.id).toBe('generic');
  });

  it('throws on unknown forced template', () => {
    const registry = new TemplateRegistry();
    const html = '<html></html>';
    expect(() => registry.resolve({ url: new URL(base), html, doc: parseHtml(html, base), headers: {} }, 'nope')).toThrow(/Unknown template/);
  });
});
