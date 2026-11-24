const { createCanvas } = require('@napi-rs/canvas');

const MONO = '"DejaVu Sans Mono", "Liberation Mono", monospace';
const LCD_BG = '#9db987';
const LCD_INK = [31, 43, 23];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapMono(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (ctx.measureText(w).width > maxW) {
        let cut = w.length;
        while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > maxW) cut--;
        if (line) { lines.push(line); line = ''; }
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

// Layar LCD digambar kecil (168x150) lalu diperbesar tanpa smoothing biar kelihatan pixel ala Nokia jadul
function drawLcd({ text, from, title, date, time }) {
  const W = 168, H = 150;
  const t = createCanvas(W, H);
  const x = t.getContext('2d');
  x.fillStyle = '#000';
  x.textBaseline = 'top';
  x.font = `bold 10px ${MONO}`;
  const fit = (s, max) => (s.length > max ? s.slice(0, max - 1) + '.' : s);

  // status bar: sinyal + baterai
  for (let i = 0; i < 4; i++) x.fillRect(4 + i * 3, 9 - (i + 1) * 2, 2, (i + 1) * 2);
  x.fillRect(W - 18, 3, 13, 7); x.clearRect(W - 17, 4, 11, 5); x.fillRect(W - 16, 5, 7, 3); x.fillRect(W - 5, 5, 2, 3);
  // judul
  const ttl = fit(title, 20);
  x.fillText(ttl, Math.round((W - x.measureText(ttl).width) / 2), 12);
  x.fillRect(2, 24, W - 4, 1);
  // pengirim + waktu
  x.fillText(fit('Dari: ' + from, 26), 4, 28);
  x.fillText(`${date} ${time}`, 4, 39);
  x.fillRect(2, 51, W - 4, 1);
  // isi pesan
  const lines = wrapMono(x, text, W - 10);
  const maxLines = 7;
  lines.slice(0, maxLines).forEach((l, i) => {
    const last = i === maxLines - 1 && lines.length > maxLines;
    x.fillText(last ? fit(l, 24) + '..' : l, 4, 55 + i * 11);
  });
  // soft key
  x.fillRect(2, H - 15, W - 4, 1);
  x.fillText('Balas', 4, H - 12);
  const back = 'Kembali';
  x.fillText(back, W - 4 - x.measureText(back).width, H - 12);

  // jadikan 1-bit (tajam) lalu tempel di latar LCD
  const img = x.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const on = img.data[i + 3] > 110;
    img.data[i] = LCD_INK[0]; img.data[i + 1] = LCD_INK[1]; img.data[i + 2] = LCD_INK[2]; img.data[i + 3] = on ? 255 : 0;
  }
  x.putImageData(img, 0, 0);
  const lcd = createCanvas(W, H);
  const l = lcd.getContext('2d');
  l.fillStyle = LCD_BG; l.fillRect(0, 0, W, H);
  l.drawImage(t, 0, 0);
  return lcd;
}

async function renderNokia(opts) {
  const SC = 4;
  const lcd = drawLcd(opts);
  const CW = 800, CH = 1020;
  const c = createCanvas(CW, CH);
  const ctx = c.getContext('2d');
  // badan HP
  const g = ctx.createLinearGradient(0, 0, CW, CH);
  g.addColorStop(0, '#2c58b8'); g.addColorStop(1, '#14316f');
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = g; rr(ctx, 30, 30, CW - 60, CH - 60, 120); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `800 54px ${MONO}`; ctx.textAlign = 'center';
  ctx.fillText('NOKIA', CW / 2, 125);
  // bezel + layar
  const sx = (CW - 168 * SC) / 2, sy = 160;
  ctx.fillStyle = '#1b2230'; rr(ctx, sx - 26, sy - 26, 168 * SC + 52, 150 * SC + 52, 34); ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lcd, sx, sy, 168 * SC, 150 * SC);
  ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(sx, sy, 168 * SC, 18);
  // tombol navigasi
  ctx.fillStyle = '#1b2a55';
  rr(ctx, 120, 880, 150, 60, 30); ctx.fill();
  rr(ctx, 530, 880, 150, 60, 30); ctx.fill();
  ctx.fillStyle = '#24366b'; ctx.beginPath(); ctx.ellipse(CW / 2, 905, 85, 55, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3; ctx.stroke();
  return c.encode('png');
}

// .nokia teks | pengirim | judul
async function cmdNokia(sock, msg, jid, argText, pushName) {
  const parts = (argText || '').split('|').map((s) => s.trim());
  const text = parts[0];
  if (!text) {
    return sock.sendMessage(
      jid,
      { text: 'Contoh:\n*.nokia kata-kata hari ini*\n*.nokia halo bro|Budi|Pesan Baru*\n\nFormat: teks|pengirim|judul (pengirim & judul boleh dikosongkan)' },
      { quoted: msg }
    );
  }
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta' });
  const time = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).replace(':', '.');
  const buffer = await renderNokia({
    text: text.slice(0, 300),
    from: (parts[1] || pushName || 'Nokia').slice(0, 30),
    title: (parts[2] || 'Pesan').slice(0, 30),
    date, time,
  });
  await sock.sendMessage(jid, { image: buffer, caption: 'SMS Nokia' }, { quoted: msg });
}

module.exports = { cmdNokia, renderNokia };
            
