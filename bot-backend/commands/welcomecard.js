const { createCanvas, loadImage } = require('@napi-rs/canvas');

const FONT = '"Liberation Sans", "DejaVu Sans", "Noto Color Emoji", sans-serif';
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function dateWita() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} • ${p(d.getUTCHours())}.${p(d.getUTCMinutes())} WITA`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, maxW) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// type: 'welcome' | 'goodbye'
async function makeCard({ type, name, groupName, memberNo, avatar }) {
  const W = 1000, H = 520;
  const welcome = type === 'welcome';
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // latar gradasi aesthetic
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (welcome) { bg.addColorStop(0, '#14082e'); bg.addColorStop(0.5, '#2b1a6b'); bg.addColorStop(1, '#0d3b66'); }
  else { bg.addColorStop(0, '#1d0a1f'); bg.addColorStop(0.5, '#4a1942'); bg.addColorStop(1, '#1b2a49'); }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, c] of [[130, 90, 190, 'rgba(255,105,180,.22)'], [880, 440, 230, 'rgba(0,200,255,.20)'], [560, 40, 120, 'rgba(180,140,255,.18)']]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.arc((i * 137) % W, (i * 89) % H, 2 + (i % 3), 0, Math.PI * 2); ctx.fill(); }

  // panel kaca
  rr(ctx, 36, 36, W - 72, H - 72, 38);
  ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.20)'; ctx.lineWidth = 2; ctx.stroke();

  // foto profil bulat + ring gradasi
  const cx = 230, cy = H / 2, R = 125;
  const ring = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  ring.addColorStop(0, '#ff7eb3'); ring.addColorStop(1, '#65d6ff');
  ctx.strokeStyle = ring; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, Math.PI * 2); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  let drawn = false;
  if (avatar) {
    try {
      const img = await loadImage(avatar);
      const s = Math.max((R * 2) / img.width, (R * 2) / img.height);
      ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
      drawn = true;
    } catch (e) { /* pakai avatar bawaan */ }
  }
  if (!drawn) {
    ctx.fillStyle = '#3a2d7a'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.arc(cx, cy - 25, 50, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy + 95, 90, 70, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // teks
  const left = 400, maxW = W - left - 70;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const tg = ctx.createLinearGradient(left, 0, left + 460, 0);
  tg.addColorStop(0, '#ff9ccf'); tg.addColorStop(1, '#8be3ff');
  ctx.fillStyle = tg; ctx.font = `800 76px ${FONT}`;
  ctx.fillText(welcome ? 'WELCOME' : 'GOODBYE', left, 190);

  ctx.fillStyle = '#ffffff'; ctx.font = `700 44px ${FONT}`;
  ctx.fillText(fit(ctx, name, maxW), left, 258);

  ctx.fillStyle = 'rgba(255,255,255,.80)'; ctx.font = `500 30px ${FONT}`;
  ctx.fillText(fit(ctx, (welcome ? 'di ' : 'dari ') + groupName, maxW), left, 306);

  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = `600 30px ${FONT}`;
  ctx.fillText(welcome ? `✨ Member ke-${memberNo}` : '👋 Sampai jumpa lagi!', left, 358);

  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `400 24px ${FONT}`;
  ctx.fillText(dateWita(), left, 412);

  return canvas.encode('png');
}

module.exports = { makeCard };
