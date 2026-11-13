# Penggunaan yang bertanggung jawab

autocraw bisa mengambil banyak halaman dengan cepat. Kamu bertanggung jawab atas cara memakainya.

## Bawaan yang melindungi situs

- robots.txt dihormati, termasuk `Crawl-delay`. `--ignore-robots` hanya untuk situs milikmu atau yang kamu punya izinnya.
- Permintaan ke satu host diberi jeda (default 500 ms) dan concurrency default 3.
- Crawl dibatasi `maxPages` dan `maxDepth`.
- `discover` menolak situs yang robots.txt-nya melarang semuanya.

## Kewajibanmu

- Patuhi ketentuan layanan situs dan hukum yang berlaku, termasuk hak cipta, hak basis data, serta hukum privasi dan penyalahgunaan komputer.
- Jangan menyalin atau menyebarkan ulang konten yang tidak kamu punya haknya. Tautan, judul, dan struktur berbeda dengan video, gambar, dan teks penuh.
- Jangan menembus paywall, autentikasi, proteksi teknis, atau DRM. autocraw hanya melaporkan tanda proteksi (misalnya HLS terenkripsi atau key system DRM), tidak membukanya.
- Jangan dipakai untuk credential stuffing, mengumpulkan data pribadi tanpa dasar hukum, pelecehan, atau mengganggu layanan.
- Identifikasi dirimu lewat `--user-agent` kustom yang memuat kontak jika pantas.

## Menjalankan server

`zac serve` mengambil URL atas nama siapa pun yang bisa menjangkaunya. Biarkan di `127.0.0.1` atau pasang autentikasi, dan jangan matikan pemblokiran alamat privat.

## Penyedia AI

Mode AI dan `extract` mengirim isi halaman atau data laporan ke OpenAI atau Anthropic. Periksa ketentuan penyedia dan kebijakan datamu sebelum mengirim konten pihak ketiga atau rahasia.
