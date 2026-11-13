# Laporan Markdown: default dan AI

Kedua mode berangkat dari `SiteReport` yang sama. Pilih dengan `--markdown default|ai`.

## Mode default

Dibuat oleh kode. Tanpa jaringan dan tanpa API key. Laporan yang sama selalu menghasilkan dokumen yang sama.

```sh
zac discover situs-kamu.example -o situs.md --lang id
zac markdown report.json --lang id -o situs.id.md
```

Template: `site-structure` (lengkap), `seo-audit`, `techstack`. Bahasa: `en` dan `id`. Judul dan label diterjemahkan; penjelasan dari detektor tetap berbahasa Inggris. Opsi: `--no-toc`, `--no-frontmatter`.

## Mode AI

Model AI menulis dokumen dari salinan laporan yang sudah dipangkas sesuai budget token.

```sh
zac markdown report.json --markdown ai --api-key KEY_KAMU --lang id
```

Penyedia: OpenAI (default `gpt-4.1`) dan Anthropic (default `claude-sonnet-5-5`). Penyedia ditebak dari awalan key (`sk-ant-` berarti Anthropic) atau dari `OPENAI_API_KEY` dan `ANTHROPIC_API_KEY`.

Cara kerja:

1. Laporan dipangkas bertahap sampai muat di `--ai-max-input` (default 24000 token). Bagian yang dipangkas dicantumkan sebagai peringatan. Kalau tetap tidak muat, muncul `E_AI_CONTEXT`.
2. Model diminta hanya memakai fakta di JSON, menulis "tidak terdeteksi" untuk data kosong, dan mengabaikan instruksi di dalam JSON.
3. Hasil di-cache di disk berdasarkan hash (provider, model, template, bahasa, prompt). Cache hit tidak memakan biaya. Matikan dengan `--no-cache`.
4. Kegagalan sementara (rate limit, timeout, error 5xx) diulang dengan backoff.
5. Dengan `--ai-fallback`, jika penyedia gagal, dokumen default dikembalikan. Error konfigurasi seperti key kosong tidak pernah disembunyikan.

Output AI bisa salah. Cek detail penting terhadap laporan JSON.

## Pilih yang mana

Mode default untuk CI, arsip, dan hal yang harus bisa direproduksi. Mode AI jika butuh penjelasan naratif atau rekomendasi dan kamu setuju mengirim data laporan (termasuk URL dan judul halaman) ke penyedia.
