const sharp = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

try {
  const fontPath = path.join(__dirname, '..', 'assets', 'fonts', 'ArialNarrow.ttf');
  GlobalFonts.registerFromPath(fontPath, 'ArialNarrowBrat');
} catch (e) {
  // font opsional, lanjut pakai default kalau tidak ketemu
}

async function toWebpSticker(buffer) {
  return sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer();
}

async function cmdSticker(sock, msg, jid) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media) {
    return sock.sendMessage(jid, { text: 'Kirim/reply gambar dengan caption *.sticker* atau *.s*' }, { quoted: msg });
  }
  if (media.type === 'videoMessage') {
    return sock.sendMessage(jid, { text: '⚠️ Sticker dari video butuh ffmpeg terpasang di server. Cek README untuk cara aktifkan.' }, { quoted: msg });
  }
  const webp = await toWebpSticker(media.buffer);
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

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function renderBratImage(text) {
  const size = 512;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  let fontSize = 64;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111111';

  let lines, fontFamily = GlobalFonts.has && GlobalFonts.has('ArialNarrowBrat') ? 'ArialNarrowBrat' : 'sans-serif';
  do {
    ctx.font = `${fontSize}px ${fontFamily}`;
    lines = wrapText(ctx, text.toLowerCase(), size - 60);
    if (lines.length * (fontSize * 1.05) > size - 60) fontSize -= 4;
    else break;
  } while (fontSize > 16);

  const lineHeight = fontSize * 1.05;
  const totalHeight = lines.length * lineHeight;
  let y = size / 2 - totalHeight / 2 + lineHeight / 2;

  for (const line of lines) {
    ctx.fillText(line, 30, y, size - 60);
    y += lineHeight;
  }

  return canvas.toBuffer('image/png');
}

async function cmdBrat(sock, msg, jid, text) {
  if (!text) return sock.sendMessage(jid, { text: 'Contoh: *.brat teks kamu di sini*' }, { quoted: msg });
  const png = await renderBratImage(text);
  const blurred = await sharp(png).blur(1.2).toBuffer();
  const webp = await toWebpSticker(blurred);
  await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
}

async function cmdIqc(sock, msg, jid, helpers) {
  const quoted = helpers.getQuoted(msg);
  const targetMsg = quoted || msg;
  const text = helpers.getText(targetMsg.message ? targetMsg : msg) || helpers.getText(msg);
  const senderJid = quoted?.participant || msg.key.participant || msg.key.remoteJid;
  const pushName = msg.pushName || 'User';

  if (!text) {
    return sock.sendMessage(jid, { text: 'Reply pesan teks yang mau dijadikan quote sticker dengan *.iqc*' }, { quoted: msg });
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

  const width = 600, height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1f2c34';
  ctx.fillRect(0, 0, width, height);

  const avatarSize = 90;
  ctx.save();
  ctx.beginPath();
  ctx.arc(70, height / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, 70 - avatarSize / 2, height / 2 - avatarSize / 2, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = '#546069';
    ctx.fillRect(70 - avatarSize / 2, height / 2 - avatarSize / 2, avatarSize, avatarSize);
  }
  ctx.restore();

  const bubbleX = 140;
  ctx.fillStyle = '#005c4b';
  roundRect(ctx, bubbleX, 60, width - bubbleX - 30, height - 120, 18);
  ctx.fill();

  ctx.fillStyle = '#8ad6c5';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(pushName, bubbleX + 20, 95);

  ctx.fillStyle = '#ffffff';
  ctx.font = '22px sans-serif';
  const lines = wrapText(ctx, text, width - bubbleX - 70);
  let ty = 135;
  for (const line of lines.slice(0, 6)) {
    ctx.fillText(line, bubbleX + 20, ty);
    ty += 28;
  }

  const png = canvas.toBuffer('image/png');
  const webp = await toWebpSticker(png);
  await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

module.exports = { cmdSticker, cmdToImg, cmdBrat, cmdIqc };
