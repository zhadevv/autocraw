# Referensi CLI

```
zac <perintah> [opsi]
```

Progress dan peringatan keluar di stderr. Hasil keluar di stdout, atau ke file dengan `-o, --output`.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `scrape <url>` | Satu halaman jadi Markdown, HTML, teks, links, images, metadata, atau screenshot |
| `map <url>` | Daftar URL situs dari sitemap dan halaman awal |
| `batch [urls...]` | Scrape banyak URL paralel, satu objek JSON per baris |
| `crawl <url>` | Crawl breadth-first dengan jenis tiap halaman |
| `discover <url>` | Analisis situs lengkap dan laporan Markdown |
| `inspect <url>` | Tech stack, payload SSR/RSC, dan hydration trap |
| `media <url>` | Player, mirror, sumber HLS/MP4, hoster, dan petunjuk proteksi |
| `probe <apa> <url>` | Satu probe: pagination, search, filter, detail, watch, read |
| `intercept [urls...]` | Rekam traffic HTTP saat halaman dimuat, dikelompokkan per domain dan jenis path |
| `captcha [url]` | Daftar captcha yang didukung, atau uji halaman untuk captcha |
| `extract <urls...>` | Ekstraksi JSON terstruktur dengan AI |
| `markdown <report>` | Laporan JSON tersimpan jadi Markdown, default atau AI |
| `export <report>` | Laporan JSON jadi JSON, Markdown, atau CSV |
| `serve` | REST API lokal |
| `doctor` | Cek lingkungan |

## Opsi umum

`-m, --mode <http|browser|auto>`, `--config`, `-A, --user-agent`, `--rotate-ua`, `--proxy`, `--browser-path`, `--timeout`, `--retries`, `--concurrency` (default 3), `--delay` (default 500 ms), `--ignore-robots`, `-H, --header`, `--headed`, `--no-stealth`, `--load-images`, `--scroll`, `--solve-captcha`, `--captcha-kind <kind>`, `--locale`, `-v, --verbose`.

Batas crawl untuk `discover` dan `crawl`: `--max-pages`, `--max-depth`, `--include`, `--exclude`, `--no-sitemap`.

Opsi AI: `--ai-provider`, `--api-key`, `--ai-model`, `--ai-base-url`, `--ai-max-input`, `--ai-max-output`, `--ai-temperature`, `--ai-timeout`, `--no-cache`.

## Contoh

```sh
zac scrape example.com -f markdown,links,metadata -o page.json
zac scrape example.com --include-tag article --exclude-tag ".ads"
zac scrape example.com --wait-ms 1500 --screenshot shot.png --full-page
zac map example.com --search "docs" --limit 50 --json
zac batch --file urls.txt --batch-concurrency 6 -o hasil.ndjson
zac crawl situs-kamu.example --max-pages 50 --format ndjson
zac discover situs-kamu.example --template wordpress-madara --no-crawl
zac inspect example.com --compare
zac intercept example.com example.com/news --json -o traffic.json
zac captcha example.com --solve
zac extract example.com/produk --schema produk.schema.json --api-key KEY_KAMU
zac serve --port 3002 --key rahasia
```

Format `-f` bisa dipisah koma atau diulang: `markdown`, `html`, `text`, `links`, `images`, `metadata`, `screenshot`.

## Kode keluar

| Kode | Arti |
| --- | --- |
| 0 | Berhasil |
| 1 | Error tak terduga, atau `extract` dengan halaman yang gagal validasi |
| 2 | Konfigurasi atau input tidak valid |
| 3 | Diblokir anti-bot atau robots.txt |
| 4 | Error HTTP, jaringan, atau timeout |
| 5 | Browser gagal jalan, navigasi, atau captcha gagal dipecahkan |
| 6 | Error penyedia AI |
| 7 | Error baca, tulis, atau parse file |

Detail lengkap semua opsi ada di [referensi CLI bahasa Inggris](../en/cli.md).
