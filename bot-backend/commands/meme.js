const { createCanvas, loadImage } = require('@napi-rs/canvas');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

const FONT = '"Liberation Sans", "DejaVu Sans", Arial, sans-serif';
const rnd = (a, b) => a + Math.random() * (b - a);

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
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
  return out;
}
const nowDot = () => { const d = new Date(Date.now() + 8 * 3600 * 1000); return `${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}`; };

// ================= .qcwa — kutipan chat WhatsApp (mode gelap) =================
const NAME_COLORS = ['#e91e63', '#00a884', '#53bdeb', '#ffb02e', '#d9a6ff', '#ff7a59', '#7fd1ae'];
function colorFor(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return NAME_COLORS[h % NAME_COLORS.length]; }
function maskNumber(jid) {
  const d = String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (/@lid$/.test(String(jid)) || d.length < 9) return '+62 8xx-xxxx-xxxx';
  const cc = d.startsWith('62') ? '62' : d.slice(0, 2);
  const first = d.slice(cc.length, cc.length + 1) || '8';
  return `+${cc} ${first}xx-xxxx-xxxx`;
}

async function renderQc({ text, name, number, time }) {
  const probe = createCanvas(10, 10).getContext('2d');
  probe.font = `40px ${FONT}`;
  const lines = wrap(probe, text, 600).slice(0, 14);
  const textW = Math.max(...lines.map((l) => probe.measureText(l).width));
  probe.font = `bold 30px ${FONT}`; const nameW = probe.measureText(name).width;
  probe.font = `28px ${FONT}`; const numW = probe.measureText(number).width;
  probe.font = `24px ${FONT}`; const timeW = probe.measureText(time).width;
  const headW = nameW + 18 + numW;
  const innerW = Math.max(textW, headW, timeW + 10);
  const bubW = Math.round(innerW + 60);
  const bubX = 120, bubY = 40;
  const bubH = 64 + lines.length * 52 + 40;
  const W = bubX + bubW + 50, H = bubY + bubH + 40;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  // latar gelap + pola titik halus
  ctx.fillStyle = '#0b141a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let y = 14; y < H; y += 46) for (let x = ((y / 46) % 2) * 23 + 8; x < W; x += 46) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  // avatar
  ctx.fillStyle = '#26353d'; ctx.beginPath(); ctx.arc(62, bubY + 44, 36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8696a0'; ctx.font = `bold 36px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText((name[0] || '?').toUpperCase(), 62, bubY + 57);
  // gelembung + ekor kiri-atas
  ctx.fillStyle = '#202c33';
  rr(ctx, bubX, bubY, bubW, bubH, 28); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bubX + 6, bubY); ctx.lineTo(bubX - 16, bubY); ctx.quadraticCurveTo(bubX - 2, bubY + 8, bubX, bubY + 30); ctx.closePath(); ctx.fill();
  // isi
  ctx.textAlign = 'left';
  ctx.fillStyle = colorFor(name); ctx.font = `bold 30px ${FONT}`; ctx.fillText(name, bubX + 30, bubY + 48);
  ctx.fillStyle = '#8696a0'; ctx.font = `28px ${FONT}`; ctx.fillText(number, bubX + 30 + nameW + 18, bubY + 48);
  ctx.fillStyle = '#e9edef'; ctx.font = `40px ${FONT}`;
  lines.forEach((l, i) => ctx.fillText(l, bubX + 30, bubY + 104 + i * 52));
  ctx.fillStyle = '#8696a0'; ctx.font = `24px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(time, bubX + bubW - 24, bubY + bubH - 16);
  return canvas.encode('png');
}

// .qcwa teks   atau   .qcwa teks | nama
async function cmdQcwa(sock, msg, jid, senderJid, helpers, argText) {
  const quoted = helpers.getQuoted(msg);
  const quotedText = quoted ? helpers.getText(quoted) : '';
  const parts = (argText || '').split('|').map((s) => s.trim());
  const text = (quotedText || parts[0] || '').slice(0, 300);
  if (!text) {
    return sock.sendMessage(jid, { text: '💬 *.qcwa teks kamu* — bikin kutipan chat WhatsApp\nContoh: *.qcwa Besok kita ketemu jam 8 ya*\nGanti nama: *.qcwa teks | Budi*\nBisa juga reply pesan orang lalu ketik *.qcwa*' }, { quoted: msg });
  }
  const sender = quoted ? quoted.key?.participant || quoted.key?.remoteJid || senderJid : senderJid;
  const name = ((quotedText ? parts[0] : parts[1]) || (quoted ? '' : msg.pushName) || 'Kamu').slice(0, 20);
  const buf = await renderQc({ text, name, number: maskNumber(sender), time: nowDot() });
  await sock.sendMessage(jid, { image: buf }, { quoted: msg });
}

// ================= .jarvismeme — meme dengan banner teks + gambar HUD JARVIS =================
function drawHud(W, H) {
  const c = createCanvas(W, H);
  const x = c.getContext('2d');
  const bg = x.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.7);
  bg.addColorStop(0, '#0b2233'); bg.addColorStop(1, '#02070d');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  // grid halus
  x.strokeStyle = 'rgba(56,215,255,.07)'; x.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let j = 0; j < H; j += 40) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36;
  const ring = (r, col, lw, dash, a0 = 0, a1 = Math.PI * 2) => {
    x.strokeStyle = col; x.lineWidth = lw; x.setLineDash(dash || []);
    x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke(); x.setLineDash([]);
  };
  ring(R, 'rgba(56,215,255,.9)', 4);
  ring(R * 0.88, 'rgba(56,215,255,.5)', 2, [3, 9]);
  ring(R * 0.74, 'rgba(255,138,31,.95)', 7, [], -0.6, 1.1);
  ring(R * 0.74, 'rgba(255,138,31,.95)', 7, [], 2.4, 3.9);
  ring(R * 0.6, 'rgba(56,215,255,.8)', 3, [18, 10]);
  ring(R * 0.42, 'rgba(255,138,31,.7)', 2);
  ring(R * 0.2, 'rgba(56,215,255,.9)', 3);
  // garis penanda
  x.strokeStyle = 'rgba(56,215,255,.85)'; x.lineWidth = 2;
  for (let a = 0; a < 360; a += 6) {
    const r1 = R * 1.04, r2 = R * (a % 30 === 0 ? 1.14 : 1.09), t = (a * Math.PI) / 180;
    x.beginPath(); x.moveTo(cx + Math.cos(t) * r1, cy + Math.sin(t) * r1); x.lineTo(cx + Math.cos(t) * r2, cy + Math.sin(t) * r2); x.stroke();
  }
  const glow = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.2);
  glow.addColorStop(0, 'rgba(180,240,255,.95)'); glow.addColorStop(1, 'rgba(56,215,255,0)');
  x.fillStyle = glow; x.beginPath(); x.arc(cx, cy, R * 0.2, 0, Math.PI * 2); x.fill();
  // panel data kiri-kanan
  x.fillStyle = 'rgba(56,215,255,.9)'; x.font = `bold ${Math.round(H * 0.045)}px ${FONT}`; x.textAlign = 'left';
  x.fillText('J.A.R.V.I.S.', 24, 44);
  x.font = `${Math.round(H * 0.034)}px ${FONT}`; x.fillStyle = 'rgba(56,215,255,.7)';
  ['SYSTEM ONLINE', `PWR ${Math.floor(rnd(70, 99))}%`, `LINK ${Math.floor(rnd(80, 100))}%`].forEach((t, i) => x.fillText(t, 24, 84 + i * Math.round(H * 0.05)));
  x.textAlign = 'right'; x.fillStyle = 'rgba(255,138,31,.9)';
  ['SCAN', 'TARGET LOCKED', 'READY'].forEach((t, i) => x.fillText(t, W - 24, 44 + i * Math.round(H * 0.05)));
  for (let i = 0; i < 6; i++) {
    x.fillStyle = 'rgba(56,215,255,.55)';
    x.fillRect(24, H - 40 - i * 16, rnd(30, 120), 8);
    x.fillRect(W - 24 - rnd(30, 120), H - 40 - i * 16, 100, 8);
  }
  return c;
}

async function cmdJarvisMeme(sock, msg, jid, argText) {
  const text = (argText || '').trim().slice(0, 120);
  if (!text) {
    return sock.sendMessage(jid, { text: '🤖 *.jarvismeme teks kamu*\nContoh: *.jarvismeme kerja rodi gaji sedikit*\n\nTeks di atas bisa kamu ganti sesukamu, gambar JARVIS di bawah tetap.\nMau pakai fotomu sendiri? Kirim/reply foto dengan caption *.jarvismeme teks*' }, { quoted: msg });
  }
  const W = 900;
  let photo = null;
  const media = await downloadQuotedOrDirectMedia(msg);
  if (media && media.type === 'imageMessage') {
    const buf = await sharp(media.buffer).rotate().resize({ width: W, height: 1200, fit: 'inside', withoutEnlargement: false }).flatten({ background: '#000' }).jpeg({ quality: 90 }).toBuffer();
    photo = await loadImage(buf);
  }
  if (!photo) photo = await loadImage(fs.readFileSync(path.join(__dirname, '..', 'assets', 'jarvis.jpg')));
  const imgW = W;
  const imgH = photo ? Math.round((photo.height / photo.width) * W) : 640;
  // banner teks
  const probe = createCanvas(10, 10).getContext('2d');
  let size = 112, lines = [];
  for (; size >= 40; size -= 4) {
    probe.font = `bold ${size}px ${FONT}`;
    lines = wrap(probe, text, W - 80);
    if (lines.length <= 3 && lines.every((l) => probe.measureText(l).width <= W - 80)) break;
  }
  const lh = size * 1.18;
  const bannerH = Math.round(lines.length * lh + 70);
  const canvas = createCanvas(W, bannerH + imgH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, bannerH);
  ctx.fillStyle = '#000000'; ctx.strokeStyle = '#000000'; ctx.lineWidth = Math.max(1.5, size * 0.03); ctx.lineJoin = 'round';
  ctx.font = `bold ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => { const y = 35 + size * 0.95 + i * lh; ctx.fillText(l, W / 2, y); ctx.strokeText(l, W / 2, y); });
  ctx.drawImage(photo, 0, bannerH, imgW, imgH);
  const out = await canvas.encode('jpeg', 92);
  await sock.sendMessage(jid, { image: out }, { quoted: msg });
}

module.exports = { cmdQcwa, cmdJarvisMeme, _test: { maskNumber } };
          
