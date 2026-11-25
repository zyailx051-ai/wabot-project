const sharp = require('sharp');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

const MAX_STICKER_KB = 900;

function ff(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('ffmpeg gagal: ' + String(stderr || err.message).slice(-200)));
      resolve();
    });
  });
}
async function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasx-'));
  try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function videoToSticker(buffer, seconds = 10) {
  return withTmp(async (dir) => {
    const input = path.join(dir, 'in.mp4');
    const out = path.join(dir, 'out.webp');
    fs.writeFileSync(input, buffer);
    let buf;
    for (const a of [{ fps: 12, q: 55 }, { fps: 10, q: 40 }, { fps: 8, q: 28 }]) {
      await ff(['-i', input, '-t', String(seconds), '-vf', `fps=${a.fps},scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0`, '-c:v', 'libwebp', '-q:v', String(a.q), '-loop', '0', '-an', out]);
      buf = fs.readFileSync(out);
      if (buf.length < MAX_STICKER_KB * 1024) break;
    }
    return buf;
  });
}

async function videoToVoice(buffer, seconds = 10) {
  return withTmp(async (dir) => {
    const input = path.join(dir, 'in.mp4');
    const out = path.join(dir, 'out.ogg');
    fs.writeFileSync(input, buffer);
    await ff(['-i', input, '-t', String(seconds), '-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', out]);
    return fs.readFileSync(out);
  });
}

async function imageToSticker(buffer) {
  return sharp(buffer).rotate().resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 85 }).toBuffer();
}

// .saudio — video (maks 10 detik) jadi stiker + suaranya.
// WhatsApp nggak mengizinkan stiker membawa suara, jadi suaranya dikirim langsung setelah stikernya (voice note).
async function cmdSaudio(sock, msg, jid) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || media.type !== 'videoMessage') {
    return sock.sendMessage(jid, { text: '🔊 *.saudio* — video jadi stiker + suara\n\nKirim *video* dengan caption *.saudio*, atau reply video lalu ketik *.saudio*.\nDurasi maksimal 10 detik.' }, { quoted: msg });
  }
  const dur = Number(msg.message?.videoMessage?.seconds || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage?.seconds || 0);
  if (dur > 10) return sock.sendMessage(jid, { text: `❌ Videonya ${dur} detik, maksimal 10 detik ya.` }, { quoted: msg });
  const sticker = await videoToSticker(media.buffer, 10);
  await sock.sendMessage(jid, { sticker }, { quoted: msg });
  try {
    const voice = await videoToVoice(media.buffer, 10);
    await sock.sendMessage(jid, { audio: voice, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
  } catch (e) {
    console.error('[saudio] gagal ambil suara:', e.message);
    await sock.sendMessage(jid, { text: 'ℹ️ Stikernya jadi, tapi video ini nggak punya suara yang bisa diambil.' }, { quoted: msg });
  }
}

// .stickertiktok <link> — ambil media TikTok lalu ubah jadi stiker (slideshow foto = satu stiker per foto)
async function cmdStickerTiktok(sock, msg, jid, argText) {
  const url = ((argText || '').match(/https?:\/\/\S+/) || [])[0];
  if (!url || !/tiktok\.com/i.test(url)) {
    return sock.sendMessage(jid, { text: '🎵 *.stickertiktok <link TikTok>*\nContoh: *.stickertiktok https://vt.tiktok.com/xxxxx*\n\n• Video jadi stiker animasi\n• Postingan foto (slideshow) jadi beberapa stiker sekaligus' }, { quoted: msg });
  }
  const { getTiktokMedia, fetchBuffer } = require('./downloader');
  let found;
  try {
    found = await getTiktokMedia(url);
  } catch (e) {
    throw new Error('Gagal ambil dari TikTok:\n• ' + (e.reasons || [e.message]).join('\n• '));
  }
  const { r } = found;
  if (r.images && r.images.length) {
    const list = r.images.slice(0, 12);
    await sock.sendMessage(jid, { text: `⏳ Membuat ${list.length} stiker...` }, { quoted: msg });
    let n = 0;
    for (const img of list) {
      try {
        await sock.sendMessage(jid, { sticker: await imageToSticker(await fetchBuffer(img, r.headers)) }, { quoted: msg });
        n++;
      } catch (e) {
        console.error('[stickertiktok] gagal satu gambar:', e.message);
      }
    }
    return sock.sendMessage(jid, { text: `✅ ${n} stiker terkirim. Tekan lama stiker → Simpan ke Stiker Favorit buat disimpan.` }, { quoted: msg });
  }
  const sticker = await videoToSticker(await fetchBuffer(r.videoUrl, r.headers), 8);
  await sock.sendMessage(jid, { sticker }, { quoted: msg });
}

module.exports = { cmdSaudio, cmdStickerTiktok };
