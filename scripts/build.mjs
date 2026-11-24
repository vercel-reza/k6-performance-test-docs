import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { injectGate, readGateConfig } from './auth-gate.mjs';

const root = process.cwd();
const outDir = path.join(root, 'public');
const zipPath = path.join(root, 'export.zip');

// Artefak yang tidak boleh ikut ter-deploy (hanya untuk hosting manual)
const EXCLUDE = new Set(['serve.js', 'README.md', 'Start Docs.command', 'Start Docs.bat', '.gitignore']);
// Direktori kerja yang tidak boleh terbawa ke dalam export
const SKIP_PREFIXES = ['public/', 'node_modules/', '.git/', '.vercel/'];

// PENTING: public/ harus dihapus SEBELUM export, kalau tidak mint akan
// meng-zip hasil build sebelumnya dan menghasilkan public/public/...
fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });

console.log('[build] mint export');
execFileSync('npx', ['mint', 'export', '--output', zipPath], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, CI: '1' },
});

console.log('[build] unzip -> public/');
fs.mkdirSync(outDir, { recursive: true });

const zip = new AdmZip(zipPath);
let entries = 0;
let skipped = 0;
for (const entry of zip.getEntries()) {
  const rel = entry.entryName.replace(/^\/+/, '');
  if (!rel || EXCLUDE.has(rel)) continue;
  if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) {
    skipped += 1;
    continue;
  }
  const target = path.join(outDir, rel);
  if (!target.startsWith(outDir + path.sep) && target !== outDir) {
    throw new Error(`Zip entry di luar public/: ${rel}`);
  }
  if (entry.isDirectory) {
    fs.mkdirSync(target, { recursive: true });
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, entry.getData());
  entries += 1;
}
fs.rmSync(zipPath, { force: true });

if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  throw new Error('public/index.html tidak ada — export gagal?');
}
if (fs.existsSync(path.join(outDir, 'public'))) {
  throw new Error('public/public terdeteksi — export membawa direktori kerja, bersihkan lalu build ulang');
}

// Gate password opsional: aktif bila DOCS_PASSWORD / DOCS_PASSWORD_SHA256 diset.
const gate = readGateConfig();
if (gate) {
  const { pages: gated, already } = injectGate(outDir, gate, console.log);
  const ttl = `${gate.ttlHours} jam`;
  console.log(`[gate] aktif (${gate.source}): ${gated} halaman disuntik, ttl sesi ${ttl}`);
  if (already) console.log(`[gate] ${already} halaman sudah bergate`);
} else {
  console.log('[gate] mati — isi docs-gate.json atau set DOCS_PASSWORD');
}

function countPages(dir) {
  let n = 0;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const full = path.join(dir, d.name);
    if (fs.existsSync(path.join(full, 'index.html'))) n += 1;
    n += countPages(full);
  }
  return n;
}

const pages = countPages(outDir);
console.log(`[build] selesai: ${entries} file, ${pages} halaman + root index.html -> public/`);
if (skipped) console.log(`[build] ${skipped} entry direktori kerja dilewati`);
