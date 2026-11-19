const sharp = require('sharp');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

function wrapWords(ctx, words, maxW) {
  const lines = [];
  let cur = [];
  for (const w of words) {
    const test = [...cur, w].join(' ');
    if (cur.length && ctx.measureText(test).width > maxW) {
      lines.push(cur.join(' '));
      cur = [w];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines;
}

function drawMemeText(ctx, text, cx, y, maxWidth, fontSize) {
  ctx.font = `bold ${fontSize}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = Math.max(3, fontSize * 0.08);
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#ffffff';
  const lines = wrapWords(ctx, text.toUpperCase().split(' '), maxWidth);
  return lines.map((line, i) => {
    const ly = y + i * fontSize * 1.15;
    ctx.strokeText(line, cx, ly);
    ctx.fillText(line, cx, ly);
    return ly;
  });
}

async function cmdSmeme(sock, msg, jid, argText) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || (media.type !== 'imageMessage' && media.type !== 'stickerMessage')) {
    return sock.sendMessage(
      jid,
      { text: 'Kirim/reply foto dengan caption *.smeme teks atas|teks bawah*\n\nContoh:\n.smeme halo|kenapa\n.smeme cuma satu baris aja juga bisa' },
      { quoted: msg }
    );
  }
  const parts = (argText || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) {
    return sock.sendMessage(jid, { text: 'Kasih teksnya juga ya, contoh: *.smeme halo|kenapa*' }, { quoted: msg });
  }
  const [top, bottom] = parts;

  const img = await loadImage(media.buffer);
  const W = img.width;
  const H = img.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const fontSize = Math.max(24, Math.round(W / 12));
  const maxWidth = W * 0.9;
  if (top) drawMemeText(ctx, top, W / 2, fontSize * 1.1, maxWidth, fontSize);
  if (bottom) {
    const lines = wrapWords(ctx, bottom.toUpperCase().split(' '), maxWidth);
    const startY = H - (lines.length - 1) * fontSize * 1.15 - fontSize * 0.4;
    drawMemeText(ctx, bottom, W / 2, startY, maxWidth, fontSize);
  }

  const png = canvas.toBuffer('image/png');
  const jpeg = await sharp(png).jpeg({ quality: 92 }).toBuffer();
  await sock.sendMessage(jid, { image: jpeg }, { quoted: msg });
}

module.exports = { cmdSmeme };
