const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { execFile } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ===== Tampilan disamakan dengan hasil bratvid2 referensi (teks hitam tebal-sempit di atas putih) =====
// Semua angka di bawah diukur dari screenshot referensi, relatif ke kanvas 512x512.
const SIZE = 512;
const FONT_SIZE = 118.6; // ukuran huruf maksimum
const SX = 1.06; // lebarkan huruf sedikit (sama seperti referensi)
const PAD_X = 60; // jarak teks dari tepi kiri
const TOP = 68; // jarak atas huruf tinggi (h, k, l) baris pertama
const PITCH = 1.147; // jarak antar baris = ukuran huruf x ini
const ASC = 0.867; // tinggi huruf tinggi (h) dibanding ukuran font Anton
const PAD_R = 40, PAD_B = 40;
const FPS = 10;

const FONT_URLS = [
  'https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf',
  'https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf',
];
const FONT_FILE = path.join(os.tmpdir(), 'wabot-fonts', 'Anton-Regular.ttf');
let fontReady = null;

// Font Anton (mirip Impact, lisensi OFL). Diunduh sekali lalu disimpan; kalau gagal, pakai font sempit bawaan server.
async function ensureFont() {
  if (fontReady) return fontReady;
  fontReady = (async () => {
    try {
      if (!fs.existsSync(FONT_FILE) || fs.statSync(FONT_FILE).size < 20000) {
        fs.mkdirSync(path.dirname(FONT_FILE), { recursive: true });
        let ok = false;
        for (const u of FONT_URLS) {
          try {
            const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 30000 });
            if (r.data.byteLength > 20000) { fs.writeFileSync(FONT_FILE, Buffer.from(r.data)); ok = true; break; }
          } catch (e) { /* coba url berikutnya */ }
        }
        if (!ok) throw new Error('unduh font gagal');
      }
      GlobalFonts.registerFromPath(FONT_FILE, 'AntonBrat');
      return true;
    } catch (e) {
      console.error('[bratvid2] font Anton nggak tersedia, pakai font cadangan:', e.message);
      fontReady = null; // coba lagi di pemakaian berikutnya
      return false;
    }
  })();
  return fontReady;
}

function fontString(size, haveAnton) {
  return haveAnton ? `${size}px "AntonBrat"` : `bold ${size}px "Liberation Sans Narrow", "Arial Narrow", sans-serif`;
}

// Bungkus kata ke baris, dengan lebar sudah memperhitungkan SX
function wrap(ctx, words, maxW) {
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width * SX > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function layout(text, haveAnton) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const words = text.trim().split(/\s+/).filter(Boolean);
  const maxW = SIZE - PAD_X - PAD_R;
  let size = FONT_SIZE;
  let lines = [];
  while (size >= 18) {
    ctx.font = fontString(size, haveAnton);
    lines = wrap(ctx, words, maxW);
    const wide = lines.some((l) => ctx.measureText(l).width * SX > maxW);
    const needH = TOP + (lines.length - 1) * size * PITCH + size * ASC + size * 0.28 + PAD_B; // + turunan huruf (g, y)
    if (!wide && needH <= SIZE) break;
    size -= 2;
  }
  return { size, lines };
}

function drawFrame(lay, haveAnton, visibleChars, cursor) {
  const { size, lines } = lay;
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#000000';
  ctx.font = fontString(size, haveAnton);
  ctx.textBaseline = 'alphabetic';
  if (!haveAnton) { ctx.strokeStyle = '#000'; ctx.lineWidth = size * 0.045; ctx.lineJoin = 'round'; } // tebalkan font cadangan
  let remaining = visibleChars;
  let lastX = PAD_X, lastBase = 0;
  lines.forEach((line, i) => {
    const take = Math.max(0, Math.min(line.length, remaining));
    const shown = line.slice(0, take);
    const baseline = TOP + size * ASC + i * size * PITCH;
    if (shown) {
      ctx.save();
      ctx.translate(PAD_X, baseline);
      ctx.scale(SX, 1);
      ctx.fillText(shown, 0, 0);
      if (!haveAnton) ctx.strokeText(shown, 0, 0);
      lastX = PAD_X + ctx.measureText(shown).width * SX;
      ctx.restore();
    } else if (take === 0 && remaining < 0) {
      /* baris belum muncul */
    }
    lastBase = baseline;
    remaining -= line.length + 1;
  });
  if (cursor && visibleChars > 0) ctx.fillRect(lastX + 4, lastBase - size * ASC, Math.max(4, size * 0.05), size * ASC);
  return canvas.toBuffer('image/png');
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('ffmpeg gagal: ' + String(stderr || err.message).slice(-200)));
      resolve();
    });
  });
}

async function buildWebp(text) {
  const haveAnton = await ensureFont();
  const lay = layout(text, haveAnton);
  const total = lay.lines.reduce((n, l) => n + l.length + 1, 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabrat-'));
  try {
    let frame = 0;
    const save = (buf) => fs.writeFileSync(path.join(dir, `f${String(frame++).padStart(3, '0')}.png`), buf);
    const step = Math.max(1, Math.round(total / 36));
    for (let i = 1; i < total; i += step) save(drawFrame(lay, haveAnton, i, frame % 2 === 0));
    const last = drawFrame(lay, haveAnton, total, false);
    for (let k = 0; k < 14; k++) save(last); // tahan hasil akhir ±1,4 detik
    const out = path.join(dir, 'out.webp');
    let buf;
    for (const q of [70, 50, 32]) {
      await runFfmpeg(['-framerate', String(FPS), '-i', path.join(dir, 'f%03d.png'), '-c:v', 'libwebp', '-q:v', String(q), '-loop', '0', '-an', out]);
      buf = fs.readFileSync(out);
      if (buf.length < 900 * 1024) break;
    }
    return buf;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function cmdBratVid2(sock, msg, jid, text) {
  const t = (text || '').trim();
  if (!t) return sock.sendMessage(jid, { text: 'Contoh: *.bratvid2 teks kamu di sini*' }, { quoted: msg });
  const webp = await buildWebp(t.slice(0, 160).toLowerCase());
  await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
}

module.exports = { cmdBratVid2, _test: { layout, wrap } };
  
