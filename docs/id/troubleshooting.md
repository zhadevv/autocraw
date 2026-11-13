# Troubleshooting

Mulai dengan `zac doctor`.

| Masalah | Solusi |
| --- | --- |
| `tsup: not found` | Jalankan `npm install` dulu |
| Build gagal di langkah deklarasi (`ReadableStream`) | Sudah diperbaiki di source terbaru. Jangan hapus `DOM` dari `lib` di `tsconfig.json` |
| `Chromium browser: not installed` | `npx playwright install chromium`, atau isi `AUTOCRAW_BROWSER_PATH` |
| `... is a directory without a Chrome/Chromium binary inside` | Arahkan ke binary-nya, misalnya `/opt/google/chrome/chrome` |
| `... does not exist` | Cek path. `~` diperluas otomatis, tapi typo tetap typo |
| Browser crash saat start | Biasanya library sistem kurang. Baca baris pertama pesan error, atau `npx playwright install-deps chromium` |
| `E_BLOCKED` (kode 3) | Coba `--mode browser`, `--headed`, `--delay` lebih besar, proxy yang diizinkan |
| `E_ROBOTS` | robots.txt melarang URL itu. Hormati kecuali situsnya milikmu |
| `E_TIMEOUT` | Naikkan `--timeout` atau coba `--mode browser` |
| Markdown kosong | Halaman dirender JavaScript. `zac inspect <url> --compare`, lalu `--mode browser` dan `--wait <selector>` |
| `argument ... is invalid` pada `-f` | Gunakan format yang valid dan pisahkan dengan koma: `-f markdown,links` |
| Sitemap 0 URL padahal index ditemukan | File sitemap anak tidak terbaca. Alasannya ada di bagian Catatan laporan |
| Template `generic` | Paksa dengan `--template wordpress-animestream` atau `wordpress-madara` |
| `E_AI_AUTH` | Key ditolak atau kuota habis |
| `E_AI_CONTEXT` | Laporan terlalu besar. Kurangi `--crawl-pages`, pakai `--no-probes`, atau naikkan `--ai-max-input` |
| Dokumen AI terpotong | Naikkan `--ai-max-output` |
| Hasil AI tidak berubah | Itu cache. Pakai `--no-cache` |

Masih macet? Jalankan dengan `-v`, lalu buat issue berisi output, versi Node.js, dan perintahmu. Hapus API key dan URL privat dulu.
