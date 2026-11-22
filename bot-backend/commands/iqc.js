const { createCanvas } = require('@napi-rs/canvas');

const FONT = '"Liberation Sans", "DejaVu Sans", "Noto Color Emoji", sans-serif';
const CARRIERS = ['Telkomsel', 'by.U', 'XL', 'Indosat', 'Tri', 'Smartfren', 'AXIS'];
const NETWORKS = ['LTE', '4G', '5G', '4G+', 'H+'];

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[rnd(0, arr.length - 1)];
const pad2 = (n) => String(n).padStart(2, '0');

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
      // pecah kata yang kepanjangan
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

// ---- ikon menu (digambar pakai garis, tanpa file gambar) ----
const ICONS = {
  star(c, x, y, s) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? s * 0.22 : s * 0.5;
      c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath(); c.stroke();
  },
  reply(c, x, y, s) {
    c.beginPath(); c.moveTo(x + s * 0.1, y - s * 0.3); c.lineTo(x - s * 0.4, y); c.lineTo(x + s * 0.1, y + s * 0.3);
    c.moveTo(x - s * 0.4, y); c.quadraticCurveTo(x + s * 0.5, y - s * 0.05, x + s * 0.5, y + s * 0.4); c.stroke();
  },
  forward(c, x, y, s) {
    c.beginPath(); c.moveTo(x - s * 0.1, y - s * 0.3); c.lineTo(x + s * 0.4, y); c.lineTo(x - s * 0.1, y + s * 0.3);
    c.moveTo(x + s * 0.4, y); c.quadraticCurveTo(x - s * 0.5, y - s * 0.05, x - s * 0.5, y + s * 0.4); c.stroke();
  },
  copy(c, x, y, s) {
    rr(c, x - s * 0.1, y - s * 0.45, s * 0.55, s * 0.6, s * 0.08); c.stroke();
    rr(c, x - s * 0.45, y - s * 0.15, s * 0.55, s * 0.6, s * 0.08); c.stroke();
  },
  chat(c, x, y, s) {
    rr(c, x - s * 0.45, y - s * 0.4, s * 0.9, s * 0.65, s * 0.18); c.stroke();
    c.beginPath(); c.moveTo(x - s * 0.2, y + s * 0.25); c.lineTo(x - s * 0.3, y + s * 0.5); c.lineTo(x, y + s * 0.25); c.stroke();
  },
  warn(c, x, y, s) {
    c.beginPath(); c.moveTo(x, y - s * 0.45); c.lineTo(x + s * 0.5, y + s * 0.4); c.lineTo(x - s * 0.5, y + s * 0.4); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(x, y - s * 0.12); c.lineTo(x, y + s * 0.12); c.moveTo(x, y + s * 0.26); c.lineTo(x, y + s * 0.27); c.stroke();
  },
  trash(c, x, y, s) {
    c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.3); c.lineTo(x + s * 0.5, y - s * 0.3);
    c.moveTo(x - s * 0.15, y - s * 0.3); c.lineTo(x - s * 0.15, y - s * 0.45); c.lineTo(x + s * 0.15, y - s * 0.45); c.lineTo(x + s * 0.15, y - s * 0.3); c.stroke();
    c.beginPath(); c.moveTo(x - s * 0.38, y - s * 0.3); c.lineTo(x - s * 0.3, y + s * 0.5); c.lineTo(x + s * 0.3, y + s * 0.5); c.lineTo(x + s * 0.38, y - s * 0.3); c.stroke();
  },
};
const MENU = [
  ['Beri Bintang', 'star'], ['Balas', 'reply'], ['Teruskan', 'forward'], ['Salin', 'copy'],
  ['Ucapkan', 'chat'], ['Laporkan', 'warn'], ['Hapus', 'trash'],
];

function drawStatusBar(ctx, W, o) {
  const y = 62;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  // sinyal
  for (let i = 0; i < 4; i++) {
    const h = 10 + i * 7;
    ctx.globalAlpha = i < o.bars ? 1 : 0.3;
    ctx.fillRect(46 + i * 11, y + 14 - h, 7, h);
  }
  ctx.globalAlpha = 1;
  ctx.font = `500 25px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`${o.carrier} ${o.network}`, 100, y);
  ctx.textAlign = 'center';
  ctx.font = `600 27px ${FONT}`;
  ctx.fillText(o.time, W / 2, y);
  // baterai
  const bx = W - 118, by = y - 13;
  ctx.textAlign = 'right';
  ctx.font = `500 25px ${FONT}`;
  ctx.fillText(`${o.battery}%`, bx - 12, y);
  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.lineWidth = 2;
  rr(ctx, bx, by, 62, 28, 8); ctx.stroke();
  ctx.fillStyle = o.battery <= 20 ? '#ff3b30' : '#fff';
  rr(ctx, bx + 4, by + 4, Math.max(4, (54 * o.battery) / 100), 20, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.fillRect(bx + 64, by + 9, 4, 10);
}

function drawChat(text, o) {
  const W = 900;
  const probe = createCanvas(10, 10).getContext('2d');
  probe.font = `500 44px ${FONT}`;
  const maxTextW = 520;
  const lines = wrap(probe, text, maxTextW).slice(0, 12);
  const lineH = 58;
  const textW = Math.max(...lines.map((l) => probe.measureText(l).width));
  probe.font = `400 26px ${FONT}`;
  const timeW = probe.measureText(o.time).width;
  const bubW = Math.min(maxTextW, Math.max(textW, 0)) + 70 + (lines.length === 1 ? timeW + 14 : 0);
  const bubH = lines.length * lineH + 52 + (lines.length === 1 ? 0 : 34);

  const left = 60;
  const reactY = 520;
  const bubY = reactY + 150;
  const menuY = bubY + bubH + 24;
  const rowH = 96;
  const menuW = 600;
  const H = Math.max(1500, menuY + MENU.length * rowH + 140);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, W, H);
  // latar chat yang "blur" (bubble samar)
  const ghosts = [[110, 180, 340, 90, 0], [430, 300, 380, 150, 1], [80, 460, 260, 70, 0], [470, H - 520, 330, 120, 1], [90, H - 330, 300, 90, 0], [430, H - 190, 380, 110, 1]];
  for (const [x, y, w, h, mine] of ghosts) {
    ctx.fillStyle = mine ? 'rgba(70,35,190,.42)' : 'rgba(120,120,130,.18)';
    rr(ctx, x, y, w, h, 36); ctx.fill();
  }
  ctx.fillStyle = 'rgba(11,11,15,.55)';
  ctx.fillRect(0, 0, W, H);

  drawStatusBar(ctx, W, o);

  // bar reaksi
  const emojis = ['❤️', '🔥', '😂', '💀', '😎', '👍'];
  ctx.fillStyle = '#25252a';
  rr(ctx, left, reactY, 700, 108, 54); ctx.fill();
  ctx.font = `50px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  emojis.forEach((e, i) => ctx.fillText(e, left + 66 + i * 94, reactY + 56));
  ctx.fillStyle = '#34343b';
  ctx.beginPath(); ctx.arc(left + 640, reactY + 54, 34, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b99bff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(left + 624, reactY + 54); ctx.lineTo(left + 656, reactY + 54); ctx.moveTo(left + 640, reactY + 38); ctx.lineTo(left + 640, reactY + 70); ctx.stroke();

  // bubble pesan
  ctx.fillStyle = '#2a2a2f';
  rr(ctx, left, bubY, bubW, bubH, 42); ctx.fill();
  ctx.fillStyle = '#f2f2f4';
  ctx.font = `500 44px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, left + 36, bubY + 66 + i * lineH));
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = `400 26px ${FONT}`;
  ctx.textAlign = 'right';
  if (lines.length === 1) ctx.fillText(o.time, left + bubW - 30, bubY + bubH - 24);
  else ctx.fillText(o.time, left + bubW - 30, bubY + bubH - 20);

  // menu konteks
  ctx.fillStyle = '#25252a';
  rr(ctx, left, menuY, menuW, MENU.length * rowH, 40); ctx.fill();
  MENU.forEach(([label, icon], i) => {
    const cy = menuY + i * rowH + rowH / 2;
    const red = icon === 'trash';
    if (i) { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(left + 34, menuY + i * rowH, menuW - 68, 2); }
    ctx.fillStyle = red ? '#ff453a' : '#f2f2f4';
    ctx.font = `500 38px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, left + 38, cy);
    ctx.strokeStyle = red ? '#ff453a' : '#c9c9d1';
    ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ICONS[icon](ctx, left + menuW - 62, cy, 40);
  });
  return canvas;
}

// .iqc <teks>  atau  .iqc teks | jam | baterai | jaringan | provider   (semua setelah teks opsional)
async function cmdIqc(sock, msg, jid, helpers, argText) {
  const quoted = helpers.getQuoted(msg);
  const raw = ((quoted && helpers.getText(quoted)) || argText || '').trim();
  if (!raw) {
    return sock.sendMessage(
      jid,
      {
        text:
          '📱 *IQC* — bikin screenshot chat iPhone palsu\n\n' +
          'Contoh:\n*.iqc Halo bray*\n*.iqc Halo bray | 16.06 | 6 | LTE | by.U*\n\n' +
          'Urutan: teks | jam | baterai (1-100) | jaringan | provider\n' +
          'Yang nggak diisi bakal diacak otomatis. Bisa juga reply pesan teks lalu ketik *.iqc*',
      },
      { quoted: msg }
    );
  }
  const parts = (quoted && helpers.getText(quoted) ? argText || '' : raw).split('|').map((s) => s.trim());
  const text = (quoted && helpers.getText(quoted) ? helpers.getText(quoted) : parts[0]).slice(0, 400);
  const opt = quoted && helpers.getText(quoted) ? ['', ...parts] : parts;

  const wita = new Date(Date.now() + 8 * 3600 * 1000); // jam WITA
  const randTime = Math.random() < 0.5
    ? `${pad2(wita.getUTCHours())}.${pad2(wita.getUTCMinutes())}`
    : `${pad2(rnd(0, 23))}.${pad2(rnd(0, 59))}`;
  let time = (opt[1] || '').replace(':', '.');
  if (!/^\d{1,2}\.\d{2}$/.test(time)) time = randTime;
  let battery = parseInt(opt[2], 10);
  if (!(battery >= 1 && battery <= 100)) battery = rnd(3, 100);
  const network = (opt[3] || '').trim().slice(0, 6) || pick(NETWORKS);
  const carrier = (opt[4] || '').trim().slice(0, 12) || pick(CARRIERS);

  const canvas = drawChat(text, { time, battery, network, carrier, bars: rnd(2, 4) });
  const buffer = await canvas.encode('png');
  await sock.sendMessage(jid, { image: buffer, caption: `📱 ${time} • ${battery}% • ${carrier} ${network}` }, { quoted: msg });
}

module.exports = { cmdIqc };
  
