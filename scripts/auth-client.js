/* Gate password sisi klien untuk situs hasil `mint export` (static hosting).
 *
 * File ini disalin apa adanya oleh scripts/build.mjs ke public/_gate/auth.js dan
 * dimuat secara sinkron di dalam <head> setiap halaman:
 *
 *   <script data-k6-gate src="/_gate/auth.js" data-sha256="<hex>" data-ttl-hours="12"></script>
 *
 * Konfigurasi hanya berisi SHA-256 password (bukan password mentah). Setelah
 * password benar, token {sig, exp} disimpan di localStorage dan halaman dimuat
 * ulang tanpa overlay selama ttl-hours.
 *
 * Catatan keamanan: ini gate "lembut" — HTML tetap bisa diambil langsung.
 * Untuk proteksi sungguhan pakai Password Protection Vercel / edge middleware.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var expected = (script.getAttribute('data-sha256') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return;

  var ttlHours = parseFloat(script.getAttribute('data-ttl-hours'));
  if (!isFinite(ttlHours) || ttlHours <= 0) ttlHours = 12;
  var ttlMs = ttlHours * 3600 * 1000;

  var KEY = 'k6docs.auth.v1';
  var root = document.documentElement;

  function readToken() {
    try {
      var token = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (token && token.sig === expected && typeof token.exp === 'number' && token.exp > Date.now()) {
        return token;
      }
    } catch (err) {
      /* localStorage diblokir / isi rusak -> anggap belum login */
    }
    return null;
  }

  function saveToken() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ sig: expected, exp: Date.now() + ttlMs }));
      return true;
    } catch (err) {
      return false;
    }
  }

  function sha256Hex(text) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle || typeof TextEncoder === 'undefined') {
      return Promise.reject(new Error('insecure-context'));
    }
    return subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var out = '';
      for (var i = 0; i < bytes.length; i += 1) {
        out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
      }
      return out;
    });
  }

  if (readToken()) return;

  root.classList.add('k6-locked');

  var STYLE = [
    'html.k6-locked,html.k6-locked body{overflow:hidden!important}',
    '.k6g{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;',
    'padding:24px;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    'html.dark .k6g{background:#0b0f19;color:#e2e8f0}',
    '.k6g-card{width:100%;max-width:380px;padding:32px 28px;border-radius:16px;background:#fff;',
    'border:1px solid #e2e8f0;box-shadow:0 24px 60px -24px rgba(15,23,42,.35);text-align:center}',
    'html.dark .k6g-card{background:#111827;border-color:#1f2937;box-shadow:0 24px 60px -24px rgba(0,0,0,.8)}',
    '.k6g-icon{font-size:28px;line-height:1;margin-bottom:12px}',
    '.k6g h1{font-size:18px;font-weight:600;margin:0 0 8px}',
    '.k6g p{margin:0 0 16px;font-size:13px;line-height:1.5;color:#475569}',
    'html.dark .k6g p{color:#94a3b8}',
    '.k6g-input{width:100%;box-sizing:border-box;padding:11px 14px;font-size:14px;border-radius:10px;',
    'border:1px solid #cbd5e1;background:#fff;color:inherit;outline:none}',
    '.k6g-input:focus{border-color:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.18)}',
    'html.dark .k6g-input{background:#0b0f19;border-color:#334155}',
    '.k6g-error{margin:10px 0 0!important;font-size:12.5px;color:#dc2626!important;min-height:16px}',
    '.k6g-btn{width:100%;margin-top:14px;padding:11px 14px;font-size:14px;font-weight:600;border:0;border-radius:10px;',
    'background:#16a34a;color:#fff;cursor:pointer}',
    '.k6g-btn:hover{background:#15803d}',
    '.k6g-btn[disabled]{opacity:.6;cursor:progress}',
    '.k6g-note{margin:14px 0 0!important;font-size:11.5px;color:#94a3b8!important}'
  ].join('');

  function build() {
    var style = document.createElement('style');
    style.textContent = STYLE;

    var overlay = document.createElement('div');
    overlay.className = 'k6g';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<form class="k6g-card" novalidate>' +
      '<div class="k6g-icon">\uD83D\uDD12</div>' +
      '<h1>Dokumentasi terlindungi</h1>' +
      '<p>Masukkan password untuk membuka dokumentasi ini.</p>' +
      '<input class="k6g-input" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password" />' +
      '<p class="k6g-error" role="alert"></p>' +
      '<button class="k6g-btn" type="submit">Buka dokumentasi</button>' +
      '<p class="k6g-note">Sesi tersimpan di perangkat ini selama ' + ttlHours + ' jam.</p>' +
      '</form>';

    var form = overlay.querySelector('form');
    var input = overlay.querySelector('.k6g-input');
    var error = overlay.querySelector('.k6g-error');
    var button = overlay.querySelector('.k6g-btn');

    function fail(message) {
      error.textContent = message;
      button.disabled = false;
      button.textContent = 'Buka dokumentasi';
      input.value = '';
      input.focus();
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (button.disabled) return;
      var value = input.value;
      if (!value) {
        error.textContent = 'Password belum diisi.';
        return;
      }
      error.textContent = '';
      button.disabled = true;
      button.textContent = 'Memeriksa...';
      sha256Hex(value)
        .then(function (digest) {
          if (digest !== expected) {
            fail('Password salah. Coba lagi.');
            return;
          }
          if (!saveToken()) {
            error.textContent = 'Penyimpanan browser diblokir; muat ulang halaman lalu coba lagi.';
            button.disabled = false;
            button.textContent = 'Buka dokumentasi';
            return;
          }
          window.location.reload();
        })
        .catch(function () {
          fail('Verifikasi butuh HTTPS atau localhost.');
        });
    });

    document.body.appendChild(style);
    document.body.appendChild(overlay);
    input.focus();
  }

  if (document.body) {
    build();
  } else if (typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', build);
  }
})();
