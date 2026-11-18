const sharp = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

// Font opsional: taruh ArialNarrow.ttf di assets/fonts/ kalau mau hasil .brat persis.
try {
  GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'ArialNarrow.ttf'), 'ArialNarrowBrat');
} catch (e) {
  // lanjut pakai font bawaan server
}

const BRAT_FONT = '"ArialNarrowBrat", "Liberation Sans Narrow", "Arial Narrow", sans-serif';

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('ffmpeg gagal: ' + String(stderr || err.message).slice(-200)));
      resolve();
    });
  });
}

async function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wast-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function toWebpSticker(buffer) {
  return sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer();
}

async function videoToAnimatedSticker(buffer) {
  return withTmp(async (dir) => {
    const input = path.join(dir, 'in.mp4');
    const output = path.join(dir, 'out.webp');
    fs.writeFileSync(input, buffer);
    const attempts = [
      { fps: 12, q: 50 },
      { fps: 8, q: 30 },
    ];
    let out;
    for (const a of attempts) {
      await runFfmpeg([
        '-i', input,
        '-t', '6',
        '-vf', `fps=${a.fps},scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0`,
        '-c:v', 'libwebp',
        '-q:v', String(a.q),
        '-loop', '0',
        '-an',
        output,
      ]);
      out = fs.readFileSync(output);
      if (out.length < 900 * 1024) break;
    }
    return out;
  });
}

async function cmdSticker(sock, msg, jid) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media) {
    return sock.sendMessage(jid, { text: 'Kirim/reply gambar atau video dengan caption *.s*' }, { quoted: msg });
  }
  let webp;
  if (media.type === 'videoMessage') webp = await videoToAnimatedSticker(media.buffer);
  else if (media.type === 'stickerMessage') webp = media.buffer;
  else webp = await toWebpSticker(media.buffer);
  await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
}

async function cmdToImg(sock, msg, jid) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || media.type !== 'stickerMessage') {
    return sock.sendMessage(jid, { text: 'Reply stiker dengan caption *.toimg*' }, { quoted: msg });
  }
  const png = await sharp(media.buffer).png().toBuffer();
  await sock.sendMessage(jid, { image: png }, { quoted: msg });
}

// ---------- Brat ----------
function wrapWords(ctx, words, maxW) {
  const lines = [];
  let cur = [];
  for (const w of words) {
    const test = [...cur, w].join(' ');
    if (cur.length && ctx.measureText(test).width > maxW) {
      lines.push(cur);
      cur = [w];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function layoutBrat(text) {
  const size = 512;
  const pad = 36;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const words = text.trim().split(/\s+/).filter(Boolean);
  const maxW = size - pad * 2;
  let fontSize = 120;
  let lines = [];
  while (fontSize >= 20) {
    ctx.font = `${fontSize}px ${BRAT_FONT}`;
    lines = wrapWords(ctx, words, maxW);
    const tooWide = lines.some((l) => ctx.measureText(l.join(' ')).width > maxW);
    if (!tooWide && lines.length * fontSize * 1.1 <= size - pad * 2) break;
    fontSize -= 4;
  }
  return { fontSize, lines, size, pad };
}

function drawBrat(layout, visible) {
  const { fontSize, lines, size, pad } = layout;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px ${BRAT_FONT}`;
  ctx.textBaseline = 'top';
  let count = 0;
  let y = pad;
  for (const line of lines) {
    const shown = [];
    for (const w of line) {
      if (count < visible) shown.push(w);
      count++;
    }
    if (shown.length) ctx.fillText(shown.join(' '), pad, y);
    y += fontSize * 1.1;
  }
  return canvas.toBuffer('image/png');
}

async function cmdBrat(sock, msg, jid, text) {
  if (!text) return sock.sendMessage(jid, { text: 'Contoh: *.brat teks kamu di sini*' }, { quoted: msg });
  const layout = layoutBrat(text.slice(0, 300).toLowerCase());
  const png = drawBrat(layout, Infinity);
  const blurred = await sharp(png).blur(1.2).toBuffer();
  const webp = await toWebpSticker(blurred);
  await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
}

async function cmdBratVid(sock, msg, jid, text) {
  if (!text) return sock.sendMessage(jid, { text: 'Contoh: *.bratvid teks kamu di sini*' }, { quoted: msg });
  const layout = layoutBrat(text.slice(0, 200).toLowerCase());
  const total = layout.lines.reduce((n, l) => n + l.length, 0);
  const webp = await withTmp(async (dir) => {
    let frame = 0;
    const save = (buf) => fs.writeFileSync(path.join(dir, `f${String(frame++).padStart(3, '0')}.png`), buf);
    for (let i = 1; i <= total; i++) {
      const png = drawBrat(layout, i);
      const blurred = await sharp(png).blur(1).png().toBuffer();
      save(blurred);
      if (i === total) {
        for (let k = 0; k < 4; k++) save(blurred);
      }
    }
    const out = path.join(dir, 'out.webp');
    await runFfmpeg([
      '-framerate', '2',
      '-i', path.join(dir, 'f%03d.png'),
      '-c:v', 'libwebp',
      '-q:v', '70',
      '-loop', '0',
      '-an',
      out,
    ]);
    return fs.readFileSync(out);
  });
  await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
}

// ---------- IQC: quote chat (bubble bergaya chat, bukan tiruan screenshot asli) ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bubbleWithTail(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r);
  ctx.moveTo(x + 2, y + h - 14);
  ctx.quadraticCurveTo(x - 10, y + h - 2, x - 2, y + h + 6);
  ctx.quadraticCurveTo(x + 10, y + h - 4, x + 14, y + h - 14);
  ctx.closePath();
}

function wrapLine(ctx, text, maxWidth) {
  const lines = wrapWords(ctx, text.split(' '), maxWidth);
  return lines.map((l) => l.join(' '));
}

async function cmdIqc(sock, msg, jid, helpers, argText) {
  const quoted = helpers.getQuoted(msg);
  const text = ((quoted && helpers.getText(quoted)) || argText || '').trim();
  const senderJid = quoted?.participant || msg.key.participant || msg.key.remoteJid;
  const name = quoted ? senderJid.split('@')[0] : msg.pushName || 'User';

  if (!text) {
    return sock.sendMessage(
      jid,
      { text: 'Reply pesan teks dengan *.iqc*, atau tulis *.iqc teks kamu*' },
      { quoted: msg }
    );
  }

  let avatarImg = null;
  try {
    const url = await sock.profilePictureUrl(senderJid, 'image');
    const axios = require('axios');
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    avatarImg = await loadImage(Buffer.from(resp.data));
  } catch (e) {
    avatarImg = null;
  }

  const width = 620;
  const pad = 26;
  const bubbleX = 150;
  const bubbleW = width - bubbleX - 30;

  const measureCanvas = createCanvas(10, 10);
  const mctx = measureCanvas.getContext('2d');
  mctx.font = '23px "Segoe UI", sans-serif';
  const lines = wrapLine(mctx, text, bubbleW - 44);
  const shown = lines.slice(0, 7);
  const lineH = 30;
  const bubbleH = 54 + shown.length * lineH + 18;
  const height = Math.max(220, bubbleH + pad * 2);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0b1f1c');
  grad.addColorStop(1, '#13302a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const avatarSize = 96;
  const avatarCy = height / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(76, avatarCy, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, 76 - avatarSize / 2, avatarCy - avatarSize / 2, avatarSize, avatarSize);
  } else {
    const g2 = ctx.createLinearGradient(30, 0, 120, 0);
    g2.addColorStop(0, '#2a6f5e');
    g2.addColorStop(1, '#1b4a3d');
    ctx.fillStyle = g2;
    ctx.fillRect(76 - avatarSize / 2, avatarCy - avatarSize / 2, avatarSize, avatarSize);
    ctx.fillStyle = '#cfe8df';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name[0] || '?').toUpperCase(), 76, avatarCy + 2);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  const bubbleY = (height - bubbleH) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  bubbleWithTail(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 20);
  ctx.fillStyle = '#025c4c';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#7ad9c0';
  ctx.font = 'bold 22px "Segoe UI", sans-serif';
  ctx.fillText(name, bubbleX + 22, bubbleY + 34);

  ctx.fillStyle = '#eafaf3';
  ctx.font = '23px "Segoe UI", sans-serif';
  let ty = bubbleY + 68;
  for (const line of shown) {
    ctx.fillText(line, bubbleX + 22, ty);
    ty += lineH;
  }

  const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  ctx.fillStyle = 'rgba(234,250,243,0.55)';
  ctx.font = '15px "Segoe UI", sans-serif';
  const timeText = now;
  const timeW = ctx.measureText(timeText).width;
  ctx.fillText(timeText, bubbleX + bubbleW - timeW - 34, bubbleY + bubbleH - 16);
  ctx.strokeStyle = '#53bdeb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bubbleX + bubbleW - 24, bubbleY + bubbleH - 20);
  ctx.lineTo(bubbleX + bubbleW - 20, bubbleY + bubbleH - 16);
  ctx.lineTo(bubbleX + bubbleW - 12, bubbleY + bubbleH - 24);
  ctx.moveTo(bubbleX + bubbleW - 18, bubbleY + bubbleH - 20);
  ctx.lineTo(bubbleX + bubbleW - 14, bubbleY + bubbleH - 16);
  ctx.lineTo(bubbleX + bubbleW - 6, bubbleY + bubbleH - 24);
  ctx.stroke();

  const png = canvas.toBuffer('image/png');
  const jpeg = await sharp(png).flatten({ background: '#0b1f1c' }).jpeg({ quality: 92 }).toBuffer();
  await sock.sendMessage(jid, { image: jpeg }, { quoted: msg });
}

// ---------- BratVid2: animasi ketik huruf-per-huruf + kursor berkedip ----------
function layoutBratChars(text) {
  const size = 512;
  const pad = 36;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const maxW = size - pad * 2;
  let fontSize = 110;
  let lines = [];
  while (fontSize >= 20) {
    ctx.font = `${fontSize}px ${BRAT_FONT}`;
    lines = wrapWords(ctx, text.trim().split(/\s+/).filter(Boolean), maxW);
    const tooWide = lines.some((l) => ctx.measureText(l.join(' ')).width > maxW);
    if (!tooWide && lines.length * fontSize * 1.1 <= size - pad * 2) break;
    fontSize -= 4;
  }
  const full = lines.map((l) => l.join(' ')).join('\n');
  return { fontSize, lines: full.split('\n'), size, pad };
}

function drawBratChars(layout, visibleChars, showCursor) {
  const { fontSize, lines, size, pad } = layout;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px ${BRAT_FONT}`;
  ctx.textBaseline = 'top';
  let remaining = visibleChars;
  let y = pad;
  let lastX = pad, lastY = y;
  for (const line of lines) {
    const take = Math.max(0, Math.min(line.length, remaining));
    const shown = line.slice(0, take);
    if (shown) ctx.fillText(shown, pad, y);
    lastX = pad + ctx.measureText(shown).width;
    lastY = y;
    remaining -= line.length + 1;
    y += fontSize * 1.1;
    if (remaining < 0 && take < line.length) break;
  }
  if (showCursor) {
    ctx.fillRect(lastX + 3, lastY + 4, Math.max(3, fontSize * 0.06), fontSize * 0.9);
  }
  return canvas.toBuffer('image/png');
}

async function cmdBratVid2(sock, msg, jid, text) {
  if (!text) return sock.sendMessage(jid, { text: 'Contoh: *.bratvid2 teks kamu di sini*' }, { quoted: msg });
  const layout = layoutBratChars(text.slice(0, 160).toLowerCase());
  const totalChars = layout.lines.join('\n').length;
  const webp = await withTmp(async (dir) => {
    let frame = 0;
    const save = (buf) => fs.writeFileSync(path.join(dir, `f${String(frame++).padStart(3, '0')}.png`), buf);
    const step = Math.max(1, Math.round(totalChars / 40));
    for (let i = 1; i <= totalChars; i += step) {
      save(drawBratChars(layout, i, frame % 2 === 0));
    }
    const last = drawBratChars(layout, totalChars, false);
    for (let k = 0; k < 5; k++) save(last);
    const out = path.join(dir, 'out.webp');
    await runFfmpeg([
      '-framerate', '10',
      '-i', path.join(dir, 'f%03d.png'),
      '-c:v', 'libwebp',
      '-q:v', '65',
      '-loop', '0',
      '-an',
      out,
    ]);
    return fs.readFileSync(out);
  });
  await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
}

module.exports = { cmdSticker, cmdToImg, cmdBrat, cmdBratVid, cmdBratVid2, cmdIqc };
