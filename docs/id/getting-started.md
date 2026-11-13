# Memulai

## Kebutuhan

- Node.js 22 atau lebih baru
- Browser Chrome atau Chromium, hanya untuk halaman yang butuh JavaScript, actions, atau screenshot

## Instalasi

```sh
npm install -g @zhadev/autocraw
zac doctor
```

Tanpa install global:

```sh
npx @zhadev/autocraw doctor
```

Dari source:

```sh
npm install && npm run build
node dist/cli.js doctor
```

`zac` adalah nama perintahnya (zhadev auto craw). `autocraw` tetap bisa dipakai sebagai alias.

## Setup browser

autocraw hanya membuka browser kalau perlu: tantangan anti-bot, halaman client-side kosong, actions, dan screenshot. Pilih salah satu:

Opsi 1, unduh Chromium milik Playwright:

```sh
npx playwright install chromium
```

Opsi 2, pakai browser yang sudah ada. Isi path absolut ke binary-nya di `.env`:

```
AUTOCRAW_BROWSER_PATH=/usr/bin/google-chrome-stable
```

`~` otomatis diperluas, dan folder yang berisi binary `chrome` juga diterima. Bisa juga lewat `--browser-path`.

## File .env

CLI membaca `.env` dari folder saat ini. Salin `.env.example` lalu isi yang dibutuhkan (`AUTOCRAW_BROWSER_PATH`, `AUTOCRAW_PROXY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

## Perintah pertama

```sh
zac scrape example.com
zac map example.com --search pricing
zac discover situs-kamu.example -o situs.md --json-out report.json --lang id
zac markdown report.json --markdown ai --api-key KEY_KAMU --lang id
```

## Pemakaian sebagai library

```ts
import { Autocraw } from '@zhadev/autocraw';

const crawler = new Autocraw({ mode: 'auto' });
try {
  const page = await crawler.scrape('example.com', { formats: ['markdown', 'links'] });
  console.log(page.markdown);
} finally {
  await crawler.close();
}
```

Selalu panggil `close()` untuk menutup koneksi HTTP dan browser.
