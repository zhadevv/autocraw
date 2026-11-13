<p align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="logo autocraw">
</p>

<h1 align="center">autocraw</h1>

<p align="center">
  <b>Scrape, map, crawl, dan pahami struktur situs apa pun.</b><br>
  Markdown siap-LLM, ekstraksi terstruktur, dan mesin site intelligence yang menjelaskan bagaimana sebuah situs dibangun.
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="docs/id/index.md">Dokumentasi</a> ·
  <a href="docs/id/getting-started.md">Memulai</a> ·
  <a href="docs/id/cli.md">CLI</a>
</p>

---

autocraw adalah toolkit Node.js 22+ dengan tiga wajah: CLI bernama **`zac`** (Zhadev Auto Craw), library TypeScript, dan REST API lokal. Selain scraping sehari-hari, autocraw memberi tahu **cara kerja sebuah situs** sebelum kamu menulis satu selector pun.

## Fitur

- **Scrape**: satu halaman jadi Markdown, HTML, teks, links, images, metadata, atau screenshot
- **Map**: daftar URL cepat dari sitemap dan halaman awal, dengan pencarian relevansi
- **Crawl** dan **Batch**: hormati robots.txt, jeda per host, batas per pola URL
- **Browser actions**: wait, click, type, press, scroll, hover, select
- **Extract**: ekstraksi JSON terstruktur dengan AI (OpenAI atau Anthropic) dan validasi JSON schema
- **Site intelligence**: tech stack, SSR vs CSR vs RSC vs SSG, hydration trap, pola URL, pagination, search, dan filter yang diverifikasi
- **Template WordPress**: AnimeStream (Themesia) dan Madara (MangaBooth), bisa tambah template sendiri
- **Inspeksi media**: player, mirror base64, sumber HLS dan MP4, hoster, petunjuk enkripsi
- **Laporan Markdown dua mode**: `default` (kode, reproduktif) dan `ai` (ditulis model, ada cache dan fallback)
- **REST API**: `zac serve` dengan bearer auth dan pemblokiran alamat privat (SSRF)
- **Captcha**: `--solve-captcha` menyelesaikan Cloudflare, reCAPTCHA, GeeTest, AWS WAF, Wobble, dan POWBlock langsung di browser
- **Network intercept**: `zac intercept` merekam traffic HTTP sebuah halaman dan mengelompokkannya per domain dan jenis path (API, RSC, Next data, GraphQL)

## Mulai cepat

```sh
npm install -g @zhadev/autocraw
zac doctor
zac scrape example.com
zac discover situs-kamu.example -o situs.md --json-out report.json --lang id
zac markdown report.json --markdown ai --api-key KEY_KAMU --lang id
zac scrape example.com --solve-captcha
```

Sebelum dipublish ke npm, jalankan dari source: `npm install && npm run build && node dist/cli.js <perintah>`.

Fitur browser butuh Chrome atau Chromium: `npx playwright install chromium`, atau isi `AUTOCRAW_BROWSER_PATH` dengan path absolut ke browser yang sudah ada.

## Markdown AI

Cukup isi API key. Provider ditebak dari awalan key (`sk-ant-` untuk Anthropic) atau dari `OPENAI_API_KEY` dan `ANTHROPIC_API_KEY`. Hasil di-cache berdasarkan hash sehingga request yang sama tidak membayar dua kali. Tambahkan `--ai-fallback` agar dokumen default tetap keluar jika AI gagal.

## Dokumentasi

[Bahasa Indonesia](docs/id/index.md) untuk halaman esensial, dan [English](docs/en/index.md) untuk dokumentasi lengkap (library, server API, template, konfigurasi, skema laporan, batasan).

## Penggunaan yang bertanggung jawab

autocraw menghormati robots.txt dan jeda crawl secara default. Pakai hanya pada situs yang boleh kamu akses, patuhi ketentuan layanan dan hukum yang berlaku, dan hormati hak cipta konten. autocraw melaporkan tanda enkripsi dan DRM, tidak membukanya. Lihat [penggunaan yang bertanggung jawab](docs/id/responsible-use.md).

## Lisensi

GPL-3.0-only. Lihat [LICENSE](LICENSE).
