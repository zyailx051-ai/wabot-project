const { createCanvas } = require('@napi-rs/canvas');

// Gaya mengikuti referensi: latar putih 720x1280, teks serif merah tua di tengah,
// dengan huruf yang miring / ukurannya bervariasi acak.
const W = 720, H = 1280;
const SERIF = '"Liberation Serif", "Times New Roman", "DejaVu Serif", serif';
const EMOJI = '"Noto Color Emoji", "Apple Color Emoji", sans-serif';
const MAX_W = 480;
const BASE = 66;
const LINE = 1.21;
const COLORS = { merah: '#a41828', biru: '#1e3a8a', hijau: '#166534', ungu: '#6b21a8', hitam: '#141414', emas: '#92400e', pink: '#be185d', oranye: '#c2410c' };

const rnd = (a, b) => a + Math.random() * (b - a);
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

function graphemes(text) {
  try {
    return [...new Intl.Segmenter('id', { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  } catch (e) {
    return Array.from(text);
  }
}
const isEmoji = (g) => /\p{Extended_Pictographic}/u.test(g);

// beri gaya acak per "potongan" huruf (1-5 huruf), seperti pada referensi
function styleText(chars) {
  const out = [];
  let left = 0, st = null;
  for (const ch of chars) {
    if (left <= 0) {
      left = 1 + Math.floor(Math.random() * 5);
      st = { italic: Math.random() < 0.35, scale: pickOne([0.94, 1, 1, 1.06, 1.12, 1.18]), dy: rnd(-3, 4) };
    }
    left--;
    out.push(isEmoji(ch) ? { ch, emoji: true, italic: false, scale: 1, dy: 0 } : { ch, emoji: false, ...st });
  }
  return out;
}

function fontFor(g, size) {
  const s = Math.round(size * g.scale * 10) / 10;
  return g.emoji ? `${s}px ${EMOJI}` : `${g.italic ? 'italic ' : ''}${s}px ${SERIF}`;
}

function buildWords(ctx, styled, size) {
  const words = [];
  let cur = [];
  for (const g of styled) {
    if (g.ch === ' ' || g.ch === '\n') {
      if (cur.length) words.push({ chars: cur, nl: g.ch === '\n' });
      else if (g.ch === '\n' && words.length) words[words.length - 1].nl = true;
      cur = [];
    } else cur.push(g);
  }
  if (cur.length) words.push({ chars: cur, nl: false });
  for (const w of words) {
    let x = 0;
    for (const g of w.chars) {
      ctx.font = fontFor(g, size);
      g.w = ctx.measureText(g.ch).width;
      g.x = x;
      x += g.w;
    }
    w.w = x;
  }
  return words;
}

function layoutAt(ctx, styled, size) {
  const words = buildWords(ctx, styled, size);
  const space = size * 0.26;
  const lines = [];
  let cur = { words: [], w: 0 };
  for (const w of words) {
    const add = cur.words.length ? space + w.w : w.w;
    if (cur.words.length && cur.w + add > MAX_W) { lines.push(cur); cur = { words: [w], w: w.w }; } else { cur.words.push(w); cur.w += add; }
    if (w.nl) { lines.push(cur); cur = { words: [], w: 0 }; }
  }
  if (cur.words.length) lines.push(cur);
  const tooWide = words.some((w) => w.w > MAX_W + 40);
  return { size, lines, space, fits: !tooWide && lines.length * size * LINE <= H - 360 };
}

function layout(ctx, styled) {
  let res = null;
  for (let size = BASE; size >= 26; size -= 2) {
    res = layoutAt(ctx, styled, size);
    if (res.fits) break;
  }
  return res;
}

function render(text, color) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const styled = styleText(graphemes(text));
  const { size, lines, space } = layout(ctx, styled);
  const pitch = size * LINE;
  const top = (H - lines.length * pitch) / 2;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, li) => {
    let x = (W - line.w) / 2;
    const base = top + li * pitch + size * 0.85;
    line.words.forEach((w, wi) => {
      if (wi) x += space;
      for (const g of w.chars) {
        ctx.font = fontFor(g, size);
        ctx.fillText(g.ch, x + 0, base + g.dy);
        x += g.w;
      }
    });
  });
  return canvas.encode('png');
}

// .quote teks   atau   .quote teks | warna   (merah, biru, hijau, ungu, hitam, emas, pink, oranye, acak, atau #rrggbb)
async function cmdQuote(sock, msg, jid, helpers, argText) {
  const quoted = helpers.getQuoted(msg);
  const quotedText = quoted ? helpers.getText(quoted) : '';
  const parts = (argText || '').split('|').map((s) => s.trim());
  const text = (quotedText || parts[0] || '').slice(0, 400);
  if (!text) {
    return sock.sendMessage(
      jid,
      { text: '📝 *.quote teks kamu*\nContoh: *.quote Jangan menunggu badai reda, belajarlah menari di tengah hujan ☔💃*\n\nGanti warna: *.quote teks | biru*\nWarna: merah, biru, hijau, ungu, hitam, emas, pink, oranye, acak, atau kode seperti #1e3a8a\nBisa juga reply pesan teks lalu ketik *.quote*' },
      { quoted: msg }
    );
  }
  const c = (quotedText ? parts[0] : parts[1] || '').toLowerCase();
  const color = /^#[0-9a-f]{6}$/.test(c) ? c : c === 'acak' ? pickOne(Object.values(COLORS)) : COLORS[c] || COLORS.merah;
  const buf = await render(text, color);
  await sock.sendMessage(jid, { image: buf }, { quoted: msg });
}

module.exports = { cmdQuote, _test: { layout, styleText, graphemes } };
    
