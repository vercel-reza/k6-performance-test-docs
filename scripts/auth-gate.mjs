// Gate password untuk situs statis hasil `mint export`.
//
// Dipakai scripts/build.mjs: bila DOCS_PASSWORD (atau DOCS_PASSWORD_SHA256) diset,
// setiap *.html di public/ mendapat <script> gate di dalam <head> dan
// public/_gate/auth.js ditulis dari scripts/auth-client.js.
//
// Hash (bukan password) yang ditanam ke output, jadi password mentah tidak
// pernah masuk ke artefak deploy. Konsekuensinya: ganti password = build ulang.
//
// Pemakaian CLI untuk membuat hash:
//   DOCS_PASSWORD=rahasia node scripts/auth-gate.mjs hash
//
// Urutan konfigurasi: DOCS_PASSWORD -> DOCS_PASSWORD_SHA256 -> docs-gate.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = path.join(HERE, 'auth-client.js');
const GATE_DIR = '_gate';
const GATE_URL = '/_gate/auth.js';
const MARK = 'data-k6-gate';
const TTL_DEFAULT = 12;

export function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Baca konfigurasi gate. null = gate mati. */
export function readGateConfig(env = process.env, options = {}) {
  const password = (env.DOCS_PASSWORD || '').trim();
  const precomputed = (env.DOCS_PASSWORD_SHA256 || '').trim().toLowerCase();
  const configFile = options.configFile || path.join(process.cwd(), 'docs-gate.json');

  let sha256 = precomputed;
  let source = 'DOCS_PASSWORD_SHA256';
  let rawTtl = env.DOCS_PASSWORD_TTL_HOURS;

  if (password) {
    sha256 = sha256Hex(password);
    source = 'DOCS_PASSWORD';
  } else if (!sha256) {
    if (!fs.existsSync(configFile)) return null;
    const fileConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    sha256 = String(fileConfig.sha256 || '').trim().toLowerCase();
    source = path.basename(configFile);
    if (rawTtl === undefined || rawTtl === '') rawTtl = fileConfig.ttlHours;
  }

  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error(`${source}: sha256 harus 64 karakter hex`);
  }

  const ttlHours = rawTtl === undefined || rawTtl === null || rawTtl === '' ? TTL_DEFAULT : Number(rawTtl);
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error(`ttl jam tidak valid: ${rawTtl}`);
  }

  return { sha256, ttlHours, source };
}

function snippet({ sha256, ttlHours }) {
  return [
    '<!-- k6-password-gate -->',
    `<style ${MARK}>html.k6-locked,html.k6-locked body{overflow:hidden!important}</style>`,
    `<script ${MARK} src="${GATE_URL}" data-sha256="${sha256}" data-ttl-hours="${ttlHours}"></script>`,
  ].join('');
}

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.name.toLowerCase().endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Tulis aset gate lalu suntikkan <script> ke setiap halaman.
 * @returns {{pages:number, already:number, skipped:number}}
 */
export function injectGate(outDir, config, log = () => {}) {
  const gateDir = path.join(outDir, GATE_DIR);
  fs.mkdirSync(gateDir, { recursive: true });
  fs.copyFileSync(CLIENT_SRC, path.join(gateDir, 'auth.js'));

  const tag = snippet(config);
  let pages = 0;
  let already = 0;
  const skipped = [];

  for (const file of walkHtml(outDir)) {
    const html = fs.readFileSync(file, 'utf8');
    if (html.includes(MARK)) {
      already += 1;
      continue;
    }
    const close = html.toLowerCase().lastIndexOf('</head>');
    if (close === -1) {
      skipped.push(path.relative(outDir, file));
      continue;
    }
    fs.writeFileSync(file, html.slice(0, close) + tag + html.slice(close));
    pages += 1;
  }

  if (pages === 0 && already === 0) {
    throw new Error('Gate aktif tapi tidak ada halaman yang bisa disuntik (tidak ada </head>)');
  }
  for (const rel of skipped) log(`[gate] dilewati (tanpa </head>): ${rel}`);
  return { pages, already, skipped: skipped.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] || 'hash';
  if (cmd === 'hash') {
    const password = (process.env.DOCS_PASSWORD || '').trim();
    if (!password) {
      console.error('Pakai: DOCS_PASSWORD=<password> node scripts/auth-gate.mjs hash');
      process.exit(1);
    }
    console.log(sha256Hex(password));
  } else if (cmd === 'set') {
    const password = (process.env.DOCS_PASSWORD || '').trim();
    if (!password) {
      console.error('Pakai: DOCS_PASSWORD=<password> node scripts/auth-gate.mjs set');
      process.exit(1);
    }
    const file = path.join(process.cwd(), 'docs-gate.json');
    const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const next = { sha256: sha256Hex(password), ttlHours: prev.ttlHours || TTL_DEFAULT };
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
    console.log(`docs-gate.json diperbarui (sha256 ${next.sha256.slice(0, 12)}..., ttl ${next.ttlHours} jam)`);
  } else {
    console.error(`Perintah tidak dikenal: ${cmd}`);
    process.exit(1);
  }
}
