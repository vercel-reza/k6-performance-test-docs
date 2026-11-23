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
artefak khusus hosting manual (`serve.js`, `README.md`, `Start Docs.*`), dan
memverifikasi `public/index.html` ada. `public/` dan `export.zip` tidak di-commit.

> Penting: `public/` dihapus **sebelum** export. Kalau tidak, mint ikut men-zip
> hasil build sebelumnya dan muncul `public/public/...`. `scripts/build.mjs`
> sudah menangani ini dan gagal keras bila duplikat terdeteksi.

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
