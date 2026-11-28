const sharp = require('sharp');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
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

// Video -> mp4 persegi 512x512 (H.264 + AAC) yang suaranya tetap ada. Maks 10 detik.
async function videoToSquareMp4(buffer, seconds = 10) {
  return withTmp(async (dir) => {
    const input = path.join(dir, 'in.mp4');
    const out = path.join(dir, 'out.mp4');
    fs.writeFileSync(input, buffer);
    await ff([
      '-i', input, '-t', String(seconds),
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-r', '24',
      '-c:a', 'aac', '-b:a', '64k', '-ar', '44100', '-ac', '2',
      '-movflags', '+faststart', '-shortest', out,
    ]);
    return fs.readFileSync(out);
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

// ---------- EXIF stiker (nama pack + pembuat) supaya stiker dari satu perintah terbaca satu pack ----------
function buildExif(pack, author, packId) {
  const json = Buffer.from(JSON.stringify({
    'sticker-pack-id': packId,
    'sticker-pack-name': pack,
    'sticker-pack-publisher': author,
    emojis: ['🎵'],
  }), 'utf8');
  const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  head.writeUInt32LE(json.length, 14);
  return Buffer.concat([head, json]);
}

function chunk(type, data) {
  const h = Buffer.alloc(8);
  h.write(type, 0, 'ascii');
  h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

function addExif(webp, exif, w = 512, h = 512) {
  if (webp.length < 16 || webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') return webp;
  const chunks = [];
  let off = 12;
  while (off + 8 <= webp.length) {
    const t = webp.toString('ascii', off, off + 4);
    const sz = webp.readUInt32LE(off + 4);
    chunks.push({ t, d: webp.subarray(off + 8, off + 8 + sz) });
    off += 8 + sz + (sz & 1);
  }
  let list = chunks.filter((c) => c.t !== 'EXIF');
  if (!list.length) return webp;
  if (list[0].t === 'VP8X') {
    const d = Buffer.from(list[0].d);
    d[0] |= 0x08; // flag EXIF
    list[0] = { t: 'VP8X', d };
  } else {
    const d = Buffer.alloc(10);
    d[0] = 0x08 | 0x10; // EXIF + alpha
    d.writeUIntLE(w - 1, 4, 3);
    d.writeUIntLE(h - 1, 7, 3);
    list.unshift({ t: 'VP8X', d });
  }
  list.push({ t: 'EXIF', d: exif });
  const body = Buffer.concat(list.map((c) => chunk(c.t, c.d)));
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write('WEBP', 8, 'ascii');
  return Buffer.concat([riff, body]);
}

// gambar/GIF/WebP (animasi ikut) -> stiker 512x512 WebP
async function anyToSticker(buffer) {
  let q = 80;
  let out;
  for (let i = 0; i < 3; i++) {
    out = await sharp(buffer, { animated: true, limitInputPixels: false })
      .rotate()
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: q })
      .toBuffer();
    if (out.length < MAX_STICKER_KB * 1024) break;
    q -= 25;
  }
  return out;
}

// .saudio — video (maks 10 detik) dikirim SEKALIGUS dengan suaranya dalam satu media persegi
// (bukan stiker lalu voice note terpisah).
// SAUDIO_MODE=old mengembalikan cara lama (stiker + voice note terpisah).
async function cmdSaudio(sock, msg, jid) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || media.type !== 'videoMessage') {
    return sock.sendMessage(jid, { text: '🔊 *.saudio* — video jadi stiker bersuara\n\nKirim *video* dengan caption *.saudio*, atau reply video lalu ketik *.saudio*.\nDurasi maksimal 10 detik.' }, { quoted: msg });
  }
  const dur = Number(msg.message?.videoMessage?.seconds || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage?.seconds || 0);
  if (dur > 10) return sock.sendMessage(jid, { text: `❌ Videonya ${dur} detik, maksimal 10 detik ya.` }, { quoted: msg });

  if (process.env.SAUDIO_MODE === 'old') {
    const sticker = await videoToSticker(media.buffer, 10);
    await sock.sendMessage(jid, { sticker }, { quoted: msg });
    try {
      const voice = await videoToVoice(media.buffer, 10);
      await sock.sendMessage(jid, { audio: voice, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'ℹ️ Video ini nggak punya suara yang bisa diambil.' }, { quoted: msg });
    }
    return;
  }
  const mp4 = await videoToSquareMp4(media.buffer, 10);
  await sock.sendMessage(jid, { video: mp4, mimetype: 'video/mp4', gifPlayback: false }, { quoted: msg });
}

// .rawmsg — reply pesan apa saja (mis. stiker bersuara dari teman) untuk melihat struktur aslinya.
async function cmdRawMsg(sock, msg, jid) {
  const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!q) return sock.sendMessage(jid, { text: 'Reply pesan yang mau dicek, lalu ketik *.rawmsg*' }, { quoted: msg });
  const skip = /thumbnail|mediaKey|fileSha256|fileEncSha256|directPath|waveform|streamingSidecar|scansSidecar|midQualityFileSha256/i;
  const clean = (o) => {
    if (Array.isArray(o)) return o.map(clean);
    if (o && typeof o === 'object') {
      if (o.type === 'Buffer' || o instanceof Uint8Array) return '[binary]';
      return Object.fromEntries(Object.entries(o).filter(([k]) => !skip.test(k)).map(([k, v]) => [k, clean(v)]));
    }
    return o;
  };
  await sock.sendMessage(jid, { text: '```' + JSON.stringify(clean(q), null, 1).slice(0, 3000) + '```' }, { quoted: msg });
}

// ---------- komentar TikTok: ambil stiker-nya ----------
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

// Cari URL stiker di dalam objek komentar (field bernama *sticker*; animasi didahulukan)
function collectStickerUrls(node, out = [], depth = 0) {
  if (!node || depth > 8) return out;
  if (Array.isArray(node)) { node.forEach((n) => collectStickerUrls(n, out, depth + 1)); return out; }
  if (typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node)) {
    if (/sticker/i.test(k) && v && typeof v === 'object') {
      const pick = (o) => (o && (o.url_list || o.urlList)) || null;
      const cands = [pick(v.animate_url), pick(v.animateUrl), pick(v.static_url), pick(v.staticUrl), pick(v), Array.isArray(v) ? null : (v.url ? [v.url] : null)];
      const list = cands.find((l) => Array.isArray(l) && l.length);
      const u = list && list.find((x) => /^https?:/.test(x));
      if (u) { out.push(u); continue; }
    }
    collectStickerUrls(v, out, depth + 1);
  }
  return out;
}

async function fetchComments(fullUrl, awemeId, cursor) {
  const reasons = [];
  try { // sumber 1: TikWM
    const { data } = await axios.get('https://www.tikwm.com/api/comment/list/', { params: { url: fullUrl, count: 50, cursor }, timeout: 20000, headers: { 'User-Agent': UA } });
    const list = data?.data?.comments;
    if (Array.isArray(list)) return { comments: list, next: data.data.cursor, more: !!data.data.hasMore };
    reasons.push('TikWM: ' + (data?.msg || 'tanpa data'));
  } catch (e) { reasons.push('TikWM: ' + (e.response?.status ? 'HTTP ' + e.response.status : e.message)); }
  try { // sumber 2: API web TikTok
    const { data } = await axios.get('https://www.tiktok.com/api/comment/list/', {
      params: { aid: 1988, aweme_id: awemeId, count: 50, cursor },
      timeout: 20000, headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' },
    });
    if (Array.isArray(data?.comments)) return { comments: data.comments, next: data.cursor, more: !!data.has_more };
    reasons.push('TikTok: tanpa komentar');
  } catch (e) { reasons.push('TikTok: ' + (e.response?.status ? 'HTTP ' + e.response.status : e.message)); }
  const err = new Error('Gagal ambil komentar');
  err.reasons = reasons;
  throw err;
}

// .stickertiktok <link TikTok> [| nama pack]
// Ambil STIKER yang dipakai orang di KOMENTAR postingan, jadikan satu pack (nama pack + pembuat sama).
async function cmdStickerTiktok(sock, msg, jid, argText) {
  const [linkPart, packPart] = String(argText || '').split('|');
  const url = ((linkPart || '').match(/https?:\/\/\S+/) || [])[0];
  if (!url || !/tiktok\.com/i.test(url)) {
    return sock.sendMessage(jid, { text: '🎵 *.stickertiktok <link TikTok>*\nContoh: *.stickertiktok https://vt.tiktok.com/xxxxx*\nOpsional nama pack: *.stickertiktok <link> | Pack Lucu*\n\nBot mengambil stiker yang ada di komentar postingan itu lalu mengirimnya sebagai satu pack.' }, { quoted: msg });
  }
  const { resolveTiktokUrl, fetchBuffer } = require('./downloader');
  const fullUrl = await resolveTiktokUrl(url);
  const awemeId = (fullUrl.match(/\/(?:video|photo)\/(\d+)/) || [])[1];
  if (!awemeId) throw new Error('ID postingan nggak ketemu di link. Coba link lengkap tiktok.com/@user/video/123...');

  await sock.sendMessage(jid, { text: '⏳ Mengambil stiker dari komentar...' }, { quoted: msg });
  const urls = [];
  let cursor = 0;
  try {
    for (let page = 0; page < 6 && urls.length < 30; page++) {
      const r = await fetchComments(fullUrl, awemeId, cursor);
      for (const c of r.comments) {
        for (const u of collectStickerUrls([c, c.reply_comment || c.replies || []])) if (!urls.includes(u)) urls.push(u);
      }
      if (!r.more) break;
      cursor = r.next;
    }
  } catch (e) {
    if (!urls.length) throw new Error('Gagal ambil komentar TikTok:\n• ' + (e.reasons || [e.message]).join('\n• '));
  }
  if (!urls.length) {
    return sock.sendMessage(jid, { text: '😕 Nggak ada stiker di komentar postingan ini (atau komentarnya nggak bisa dibaca bot).' }, { quoted: msg });
  }

  const pack = (packPart || '').trim().slice(0, 40) || 'Sticker TikTok';
  const author = (process.env.BOT_NAME || 'WaBot').slice(0, 30);
  const exif = buildExif(pack, author, 'tt-' + awemeId + '-' + Date.now());
  const list = urls.slice(0, 30);
  let n = 0;
  for (const u of list) {
    try {
      const webp = addExif(await anyToSticker(await fetchBuffer(u, { Referer: 'https://www.tiktok.com/' })), exif);
      await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
      n++;
    } catch (e) {
      console.error('[stickertiktok] gagal satu stiker:', e.message);
    }
  }
  await sock.sendMessage(jid, { text: n ? `✅ Pack *${pack}* — ${n} stiker dari komentar. Tekan lama stiker → Simpan ke Stiker Favorit / tambah ke pack.` : '❌ Stikernya ketemu tapi gagal diunduh/diubah.' }, { quoted: msg });
}

module.exports = { cmdSaudio, cmdStickerTiktok, cmdRawMsg, _test: { addExif, buildExif, collectStickerUrls } };
    
