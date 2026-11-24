const { createCanvas, loadImage } = require('@napi-rs/canvas');
const sharp = require('sharp');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

// Tampilan mengikuti referensi: screenshot iPhone WhatsApp gelap (bar reaksi + gelembung + menu pesan).
// Koordinat grup (u,v) diukur dari referensi 941x1671: u = x - 38, v = y - 729.
const FONT = '"Liberation Sans", "DejaVu Sans", Arial, sans-serif';
const EMOJI = '"Noto Color Emoji", "Apple Color Emoji", sans-serif';
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MENU = [['Beri Bintang', 'star'], ['Balas', 'reply'], ['Teruskan', 'forward'], ['Salin', 'copy'], ['Hapus', 'trash']];
const C = { panel: '#141414', bubble: '#1c1c1e', sep: '#2a2a2a', text: '#f5f5f7', red: '#db6965', gray: '#8d8d92' };

const REF_W = 941, REF_H = 1671;
const GROUP_W = 629;
const BUB_PADL = 24, BUB_PADR = 31, LINE_H = 38, MAX_TEXT_W = 520;

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (a) => a[rnd(0, a.length - 1)];
const pad2 = (n) => String(n).padStart(2, '0');

function rr(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      let w = word;
      while (ctx.measureText(w).width > maxW) {
        let cut = w.length;
        while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > maxW) cut--;
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out.slice(0, 14);
}

// ---------- ikon garis ----------
const ICONS = {
  star(c, x, y, s) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? s * 0.22 : s * 0.5;
      c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + 1 + Math.sin(a) * r);
    }
    c.closePath(); c.stroke();
  },
  reply(c, x, y, s) {
    c.beginPath(); c.moveTo(x - s * 0.02, y - s * 0.34); c.lineTo(x - s * 0.5, y); c.lineTo(x - s * 0.02, y + s * 0.34);
    c.moveTo(x - s * 0.48, y); c.quadraticCurveTo(x + s * 0.5, y - s * 0.1, x + s * 0.5, y + s * 0.42); c.stroke();
  },
  forward(c, x, y, s) {
    c.beginPath(); c.moveTo(x + s * 0.02, y - s * 0.34); c.lineTo(x + s * 0.5, y); c.lineTo(x + s * 0.02, y + s * 0.34);
    c.moveTo(x + s * 0.48, y); c.quadraticCurveTo(x - s * 0.5, y - s * 0.1, x - s * 0.5, y + s * 0.42); c.stroke();
  },
  copy(c, x, y, s) {
    rr(c, x - s * 0.05, y - s * 0.5, s * 0.5, s * 0.62, s * 0.08); c.stroke();
    rr(c, x - s * 0.45, y - s * 0.12, s * 0.5, s * 0.62, s * 0.08); c.stroke();
  },
  trash(c, x, y, s) {
    c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.3); c.lineTo(x + s * 0.5, y - s * 0.3);
    c.moveTo(x - s * 0.16, y - s * 0.3); c.lineTo(x - s * 0.16, y - s * 0.46); c.lineTo(x + s * 0.16, y - s * 0.46); c.lineTo(x + s * 0.16, y - s * 0.3); c.stroke();
    c.beginPath(); c.moveTo(x - s * 0.38, y - s * 0.3); c.lineTo(x - s * 0.3, y + s * 0.5); c.lineTo(x + s * 0.3, y + s * 0.5); c.lineTo(x + s * 0.38, y - s * 0.3); c.stroke();
    c.beginPath(); c.moveTo(x - s * 0.12, y - s * 0.12); c.lineTo(x - s * 0.1, y + s * 0.3); c.moveTo(x + s * 0.12, y - s * 0.12); c.lineTo(x + s * 0.1, y + s * 0.3); c.stroke();
  },
};

// ---------- grup: bar reaksi + gelembung + menu ----------
function layoutGroup(ctx, text) {
  ctx.font = `31px ${FONT}`;
  const lines = wrap(ctx, text, MAX_TEXT_W);
  const lineWmax = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.font = `21px ${FONT}`;
  const timeW = ctx.measureText('00:00').width;
  const bubW = BUB_PADL + Math.max(lineWmax, timeW) + BUB_PADR;
  const bubH = 42 + (lines.length - 1) * LINE_H + 35 + 20;
  const bubY = 119;
  const menuY = bubY + bubH + 44;
  const menu2Y = menuY + MENU.length * 102 + 20;
  return { lines, bubW, bubH, bubY, menuY, menu2Y, totalH: menu2Y + 103 };
}

function drawGroup(ctx, lay, time) {
  // bar reaksi
  ctx.fillStyle = C.bubble;
  rr(ctx, 5, 0, 545, 100, 50); ctx.fill();
  ctx.font = `50px ${EMOJI}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  EMOJIS.forEach((e, i) => ctx.fillText(e, 59.5 + i * 76, 70));
  ctx.strokeStyle = '#8d8d92'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(498.5, 49.5); ctx.lineTo(516.5, 49.5); ctx.moveTo(507.5, 40.5); ctx.lineTo(507.5, 58.5); ctx.stroke();

  // gelembung pesan + ekor
  const bx = 6, by = lay.bubY;
  ctx.fillStyle = C.bubble;
  rr(ctx, bx, by, lay.bubW, lay.bubH, [22, 22, 22, 6]); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bx + 4, by + lay.bubH - 26);
  ctx.quadraticCurveTo(bx + 1, by + lay.bubH - 4, bx - 16, by + lay.bubH);
  ctx.quadraticCurveTo(bx + 8, by + lay.bubH + 1, bx + 24, by + lay.bubH - 10);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.font = `31px ${FONT}`;
  lay.lines.forEach((l, i) => ctx.fillText(l, bx + BUB_PADL, by + 42 + i * LINE_H));
  ctx.fillStyle = C.gray; ctx.font = `21px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(time, bx + lay.bubW - BUB_PADL, by + lay.bubH - 20);

  // menu
  ctx.fillStyle = C.panel;
  rr(ctx, 0, lay.menuY, GROUP_W, MENU.length * 102, 32); ctx.fill();
  rr(ctx, 0, lay.menu2Y, GROUP_W, 103, 32); ctx.fill();
  MENU.forEach(([label, icon], i) => {
    const cy = lay.menuY + i * 102 + 51;
    if (i) { ctx.fillStyle = C.sep; ctx.fillRect(0, lay.menuY + i * 102 - 1, GROUP_W, 2); }
    const red = icon === 'trash';
    ctx.fillStyle = red ? C.red : C.text; ctx.font = `36px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(label, 38, cy + 13);
    ctx.strokeStyle = red ? C.red : C.text; ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ICONS[icon](ctx, 555, cy, 38);
  });
  ctx.fillStyle = C.text; ctx.font = `36px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillText('Lainnya...', 38, lay.menu2Y + 51 + 13);
}

// ---------- latar blur (digambar kecil lalu diperbesar = efek blur) ----------
function drawGhostBackground(ctx, W, H) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const k = 8;
  const small = createCanvas(Math.ceil(W / k), Math.ceil(H / k));
  const s = small.getContext('2d');
  const R = (x, y, w, h, r, col) => { s.fillStyle = col; rr(s, x / k, y / k, w / k, h / k, r / k); s.fill(); };
  const sx = W / REF_W;
  R(45 * sx, 165, 655 * sx, 760, 60, 'rgb(24,23,23)');
  for (const [cx, cy, r] of [[200, 110, 42], [105, 265, 40], [105, 520, 40]]) {
    s.fillStyle = 'rgb(88,87,86)'; s.beginPath(); s.arc((cx * sx) / k, cy / k, r / k, 0, Math.PI * 2); s.fill();
  }
  R(290 * sx, 95, 130 * sx, 28, 12, 'rgb(48,48,48)');
  R(170 * sx, 250, 360 * sx, 40, 14, 'rgb(40,40,40)');
  R(170 * sx, 505, 330 * sx, 40, 14, 'rgb(40,40,40)');
  R(720 * sx, 60, 180 * sx, 70, 24, 'rgb(22,22,27)');
  R(670 * sx, 1020, 235 * sx, 170, 60, 'rgb(29,46,45)');
  R(690 * sx, 1250, 90 * sx, 130, 40, 'rgb(24,34,34)');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, W, H);
}

// ---------- status bar ----------
function drawStatusBar(ctx, W, o) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  ctx.font = `bold 26px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(o.time, W / 2, 30);
  // kiri
  const left = o.net;
  let x = 22;
  if (left === 'pesawat') {
    ctx.beginPath();
    [[13, 1], [14.6, 3], [14.6, 9.5], [24, 15], [24, 17], [14.6, 14.3], [14.6, 20], [17.5, 22.3], [17.5, 24], [13, 22.8], [8.5, 24], [8.5, 22.3], [11.4, 20], [11.4, 14.3], [2, 17], [2, 15], [11.4, 9.5], [11.4, 3]]
      .forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo'](x - 2 + px, 8 + py));
    ctx.closePath(); ctx.fill();
    x += 36;
  }
  if (left === 'pesawat' || left === 'wifi') {
    ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    const cx = x + 17, cy = 30;
    for (const r of [9, 16, 23]) { ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(cx, cy - 2, 2.4, 0, Math.PI * 2); ctx.fill();
  } else {
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = i < o.bars ? 1 : 0.3;
      rr(ctx, x + i * 9, 30 - (8 + i * 5), 6, 8 + i * 5, 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `600 24px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(left, x + 44, 29);
  }
  // kanan: kunci rotasi, persen, baterai
  ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(773, 21, 11, Math.PI * 0.55, Math.PI * 2.05); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(773 + 11 * Math.cos(Math.PI * 2.05) + 0, 21 + 11 * Math.sin(Math.PI * 2.05) - 5); ctx.lineTo(773 + 11 * Math.cos(Math.PI * 2.05) + 5, 21 + 11 * Math.sin(Math.PI * 2.05) + 1); ctx.lineTo(773 + 11 * Math.cos(Math.PI * 2.05) - 4, 21 + 11 * Math.sin(Math.PI * 2.05) + 2); ctx.stroke();
  ctx.lineWidth = 2; rr(ctx, 768.5, 20, 9, 7, 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(773, 20, 3, Math.PI, 0); ctx.stroke();
  ctx.font = `25px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(`${o.battery}%`, 860, 30);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
  rr(ctx, 870, 10, 50, 22, 6); ctx.stroke();
  ctx.fillStyle = o.battery <= 20 ? '#ff453a' : '#fff';
  rr(ctx, 873.5, 13.5, Math.max(4, (43 * o.battery) / 100), 15, 3.5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(921, 17, 3, 8);
}

async function renderIqc(text, o) {
  const probe = createCanvas(10, 10).getContext('2d');
  const lay = layoutGroup(probe, text);
  const ox = 38, oy = 729;
  const H = Math.max(REF_H, oy + lay.totalH + 49);
  const canvas = createCanvas(REF_W, H);
  const ctx = canvas.getContext('2d');
  drawGhostBackground(ctx, REF_W, H);
  drawStatusBar(ctx, REF_W, o);
  ctx.save(); ctx.translate(ox, oy); drawGroup(ctx, lay, o.time); ctx.restore();
  return canvas.encode('png');
}

// ---------- .meledak: foto pengguna + overlay yang sama ----------
async function renderMeledak(photoBuf, text, time) {
  let img = sharp(photoBuf).rotate();
  const meta = await img.metadata();
  const scaleUp = Math.max(1, 640 / (meta.width || 640));
  img = img.resize({ width: Math.round((meta.width || 640) * scaleUp), height: Math.round((meta.height || 640) * scaleUp), fit: 'inside' });
  const base = await img.resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#000' }).jpeg({ quality: 92 }).toBuffer();
  const photo = await loadImage(base);
  const W = photo.width, H = photo.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photo, 0, 0, W, H);
  const lay = layoutGroup(ctx, text);
  let s = (0.823 * W) / 1024;
  s = Math.min(s, (H * 0.96) / lay.totalH);
  const x0 = W - 0.0465 * W - GROUP_W * s;
  const y0 = H - lay.totalH * s - 0.002 * H;
  ctx.save(); ctx.translate(x0, y0); ctx.scale(s, s); drawGroup(ctx, lay, time); ctx.restore();
  return canvas.encode('jpeg', 92);
}

const nowWita = () => { const d = new Date(Date.now() + 8 * 3600 * 1000); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`; };

// .iqc teks | jam | baterai | jaringan(pesawat/wifi/4G/5G/LTE)
async function cmdIqc(sock, msg, jid, helpers, argText) {
  const quoted = helpers.getQuoted(msg);
  const quotedText = quoted ? helpers.getText(quoted) : '';
  const parts = (argText || '').split('|').map((s) => s.trim());
  const text = (quotedText || parts[0] || '').slice(0, 240);
  if (!text) {
    return sock.sendMessage(jid, { text: '*.iqc teks kamu*\nAtur sendiri: *.iqc halo bro | 18:02 | 70 | wifi*\nUrutan: teks | jam | baterai (1-100) | jaringan (pesawat, wifi, 4G, 5G, LTE)\nYang nggak diisi diacak otomatis. Bisa juga reply pesan teks lalu ketik *.iqc*' }, { quoted: msg });
  }
  const opt = quotedText ? ['', ...parts] : parts;
  let time = (opt[1] || '').replace('.', ':');
  if (!/^\d{1,2}:\d{2}$/.test(time)) time = Math.random() < 0.5 ? nowWita() : `${pad2(rnd(0, 23))}:${pad2(rnd(0, 59))}`;
  let battery = parseInt(opt[2], 10);
  if (!(battery >= 1 && battery <= 100)) battery = rnd(3, 100);
  const netIn = (opt[3] || '').trim().toLowerCase();
  const net = ['pesawat', 'airplane'].includes(netIn) ? 'pesawat' : netIn === 'wifi' ? 'wifi' : netIn ? netIn.toUpperCase().slice(0, 4) : pick(['pesawat', 'wifi', '4G', '5G', 'LTE']);
  const buf = await renderIqc(text, { time, battery, net, bars: rnd(2, 4) });
  await sock.sendMessage(jid, { image: buf }, { quoted: msg });
}

// .meledak [teks]  — kirim foto dengan caption .meledak (atau reply foto)
async function cmdMeledak(sock, msg, jid, helpers, argText) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || media.type !== 'imageMessage') {
    return sock.sendMessage(jid, { text: '💥 Kirim *foto* dengan caption *.meledak* (atau reply foto lalu ketik *.meledak*).\nBisa tambah teks: *.meledak halo bro*' }, { quoted: msg });
  }
  const text = ((argText || '').trim() || pick(['halo brayyy', 'p', 'woy', 'assalamualaikum', 'bang', 'halo kak'])).slice(0, 120);
  const buf = await renderMeledak(media.buffer, text, nowWita());
  await sock.sendMessage(jid, { image: buf }, { quoted: msg });
}

module.exports = { cmdIqc, cmdMeledak, _test: { layoutGroup, renderIqc } };
