# k6 Performance Test — Docs

Situs dokumentasi [Mintlify](https://mintlify.com) (`docs.json` + `*.mdx`) untuk proyek k6-performance-test.

## Pengembangan lokal

```bash
npm install
npm run dev        # http://localhost:2000
npm run validate   # cek docs.json & MDX
```

## Build produksi (static export)

```bash
npm run build      # mint export -> public/  (27 halaman, ~58 MB)
npm run preview    # build + server lokal yang meniru static hosting Vercel
```

`npm run build` menjalankan `mint export`, mengekstrak zip ke `public/`, membuang
artefak khusus hosting manual (`serve.js`, `README.md`, `Start Docs.*`), menyuntik
gate password (lihat bawah), dan memverifikasi `public/index.html` ada. `public/`
dan `export.zip` tidak di-commit.

> Penting: `public/` dihapus **sebelum** export. Kalau tidak, mint ikut men-zip
> hasil build sebelumnya dan muncul `public/public/...`. `scripts/build.mjs`
> sudah menangani ini dan gagal keras bila duplikat terdeteksi.

## Password gate halaman

Situs terkunci password sebelum konten bisa dibaca. Gate disuntik saat build:
setiap `*.html` di `public/` mendapat `<script data-k6-gate>` di `<head>` dan
`public/_gate/auth.js` (sumber: `scripts/auth-client.js`) menampilkan overlay
password. Password benar → token disimpan di `localStorage` selama `ttlHours`
(default 12 jam), halaman dimuat ulang, dan gate tidak muncul lagi.

Konfigurasi dibaca berurutan:

1. `DOCS_PASSWORD` (env) — di-hash sha256 saat build, password mentah tidak pernah masuk output.
2. `DOCS_PASSWORD_SHA256` (env) — hash siap pakai.
3. `docs-gate.json` — default repo, isinya `{ "sha256": "<hex>", "ttlHours": 12 }`.

Ganti password:

```bash
DOCS_PASSWORD='password-baru' npm run gate:set   # tulis ulang docs-gate.json
npm run build                                    # wajib: hash ditanam saat build
```

Cek hash tanpa menulis file: `DOCS_PASSWORD='...' npm run gate:hash`.
TTL sesi: `DOCS_PASSWORD_TTL_HOURS=8 npm run build`.

Di Vercel tidak perlu setup tambahan karena `docs-gate.json` ikut ter-commit;
set `DOCS_PASSWORD` di Project → Settings → Environment Variables bila ingin
menimpa password saat deploy (butuh redeploy agar berlaku).

### Batasan (penting)

Gate ini **sisi klien**: isi halaman sudah terkirim ke browser, jadi tetap bisa
dibaca lewat `curl`, view-source, atau JavaScript dimatikan. Selain itu
`/llms.txt`, `/llms-full.txt`, `/_mintlify/search-index.json`, dan halaman
markdown (`*.md`) tidak ikut terlindungi. Untuk proteksi sungguhan pakai salah
satu:

- **Vercel Deployment Protection → Password Protection** (fitur berbayar, tanpa kode), atau
- edge middleware yang menolak request sebelum file statis disajikan.

`npm run dev` (`mint dev`) tidak memakai gate — gate hanya ada di hasil `mint export`.

## Deploy ke Vercel

Repo ini static-site murni setelah build, tanpa server function:

| Setting | Nilai |
| --- | --- |
| Framework preset | Other |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `public` |
| Node.js | 20.x / 22.x |

Langkah:

1. <https://vercel.com/new> → **Import Git Repository** → `vercel-reza/k6-performance-test-docs`.
2. Pastikan konfigurasi di atas (sudah dideklarasikan di `vercel.json`, biasanya terisi otomatis).
3. Deploy. Setiap `git push` ke `main` akan memicu build + deploy ulang.
4. Custom domain: **Project → Settings → Domains**.

`vercel.json` mengatur `cleanUrls` (URL tanpa `.html`), `trailingSlash: false`,
dan `Cache-Control: immutable` untuk `/_mintlify/assets/*` serta
`/_mintlify/export-assets/*`.

### Catatan perilaku

- Navigasi antar halaman memakai **hard navigation** (bukan RSC prefetch), karena
  `mint export` tidak menghasilkan payload `index.txt`. Halaman tetap sampai
  dengan benar, hanya perpindahan halaman terasa seperti load penuh.
- Fitur Mintlify berbasis server (auth/groups, AI assistant, analytics) tidak
  tersedia pada export statis.
