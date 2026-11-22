const axios = require('axios');
const sharp = require('sharp');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

const NEXA = process.env.NEXA_BASE_URL || 'https://api.nexadev.my.id';

// Daftar endpoint Nexa per fitur. Dicoba berurutan sampai ada yang berhasil.
// Bisa ditimpa lewat env, contoh: NEXA_PATH_ANIME=/api/toanime,/ai/anime
const PATHS = {
  wink: ['/api/wink'], // terverifikasi: GET /api/wink?url=<link foto> -> { resultUrl }
  anime: ['/api/toanime', '/ai/toanime', '/api/ai/toanime', '/api/imgtoanime', '/api/anime'],
  kartun: ['/api/tocartoon', '/api/cartoon', '/ai/cartoon', '/api/tokartun'],
  tiga_d: ['/api/to3d', '/api/pixar', '/api/3d', '/ai/pixar', '/api/topixar'],
  removebg: ['/api/removebg', '/api/remove-bg', '/api/tools/removebg', '/api/rembg', '/ai/removebg'],
};
function pathsFor(key) {
  const env = process.env['NEXA_PATH_' + key.toUpperCase()];
  return env ? env.split(',').map((s) => s.trim()).filter(Boolean) : PATHS[key];
}

// ---------- upload gambar ke host sementara (API Nexa butuh link, bukan file) ----------
async function postForm(url, fields, fileField, buffer, filename) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(fileField, new Blob([buffer], { type: 'image/jpeg' }), filename);
  const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(40000), headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res;
}

const UPLOADERS = [
  async (buf) => {
    const r = await postForm('https://litterbox.catbox.moe/resources/internals/api.php', { reqtype: 'fileupload', time: '1h' }, 'fileToUpload', buf, 'foto.jpg');
    const t = (await r.text()).trim();
    if (!/^https?:\/\//.test(t)) throw new Error(t.slice(0, 100));
    return t;
  },
  async (buf) => {
    const r = await postForm('https://catbox.moe/user/api.php', { reqtype: 'fileupload' }, 'fileToUpload', buf, 'foto.jpg');
    const t = (await r.text()).trim();
    if (!/^https?:\/\//.test(t)) throw new Error(t.slice(0, 100));
    return t;
  },
  async (buf) => {
    const r = await postForm('https://uguu.se/upload', {}, 'files[]', buf, 'foto.jpg');
    const j = await r.json();
    const u = j?.files?.[0]?.url;
    if (!u) throw new Error('uguu tanpa url');
    return u;
  },
  async (buf) => {
    const r = await postForm('https://tmpfiles.org/api/v1/upload', {}, 'file', buf, 'foto.jpg');
    const j = await r.json();
    const u = j?.data?.url;
    if (!u) throw new Error('tmpfiles tanpa url');
    return u.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  },
];

async function uploadImage(buffer) {
  const errs = [];
  for (const up of UPLOADERS) {
    try {
      return await up(buffer);
    } catch (e) {
      errs.push(e.message);
      console.error('[aiimage] uploader gagal:', e.message);
    }
  }
  throw new Error('Gagal upload foto ke server sementara (' + errs.join(' | ') + ')');
}

// ---------- panggil API Nexa ----------
function findUrl(data) {
  const cands = [data?.resultUrl, data?.result, data?.url, data?.data?.url, data?.data?.rawUrl, data?.data?.result, data?.image, data?.output, data?.result?.url, data?.data?.image];
  return cands.find((c) => typeof c === 'string' && /^https?:\/\//.test(c));
}

async function callNexa(paths, imageUrl) {
  const errs = [];
  for (const p of paths) {
    try {
      const res = await axios.get(NEXA + p, { params: { url: imageUrl }, timeout: 120000, responseType: 'arraybuffer', maxRedirects: 5, validateStatus: () => true });
      const ct = String(res.headers['content-type'] || '');
      if (res.status === 200 && ct.startsWith('image/')) return Buffer.from(res.data);
      let json = null;
      try { json = JSON.parse(Buffer.from(res.data).toString('utf8')); } catch (e) { /* bukan json */ }
      const u = json && json.status !== false ? findUrl(json) : null;
      if (res.status === 200 && u) {
        const img = await axios.get(u, { responseType: 'arraybuffer', timeout: 90000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        return Buffer.from(img.data);
      }
      errs.push(`${p}: HTTP ${res.status} ${json ? JSON.stringify(json).slice(0, 80) : ct}`);
    } catch (e) {
      errs.push(`${p}: ${e.message}`);
    }
  }
  console.error('[aiimage] semua endpoint gagal:', errs.join(' || '));
  throw new Error('API-nya nggak merespons / endpoint belum cocok. Detail ada di log Railway [aiimage].');
}

async function getImage(msg) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || (media.type !== 'imageMessage' && media.type !== 'stickerMessage')) return null;
  return media.buffer;
}

async function toJpeg(buf) {
  return sharp(buf).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
}

async function viaNexa(key, buf) {
  const url = await uploadImage(await toJpeg(buf));
  return callNexa(pathsFor(key), url);
}

// ---------- efek lokal (tanpa API) ----------
async function small(buf) {
  return sharp(buf).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).toBuffer();
}
async function localCartoon(buf) {
  const r = await small(buf);
  const poster = await sharp(r).median(5).modulate({ saturation: 1.6, brightness: 1.05 }).png({ palette: true, colors: 24, dither: 0 }).toBuffer();
  const edges = await sharp(r).greyscale().blur(1).convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] }).negate().threshold(215).toBuffer();
  return sharp(poster).composite([{ input: edges, blend: 'multiply' }]).jpeg({ quality: 92 }).toBuffer();
}
async function localSketch(buf) {
  const r = await small(buf);
  const gray = await sharp(r).greyscale().png().toBuffer();
  const inv = await sharp(gray).negate().blur(10).png().toBuffer();
  return sharp(gray).composite([{ input: inv, blend: 'color-dodge' }]).jpeg({ quality: 92 }).toBuffer();
}
async function localBW(buf) {
  const r = await small(buf);
  return sharp(r).greyscale().normalise().jpeg({ quality: 92 }).toBuffer();
}

// ---------- perintah ----------
const USAGE = (cmd) => `Kirim atau reply *foto* dengan caption *.${cmd}*`;

async function sendResult(sock, jid, msg, buf, caption) {
  await sock.sendMessage(jid, { image: buf, caption }, { quoted: msg });
}

async function runStyle(sock, msg, jid, cmdName, key, caption, fallback) {
  const buf = await getImage(msg);
  if (!buf) return sock.sendMessage(jid, { text: USAGE(cmdName) }, { quoted: msg });
  await sock.sendMessage(jid, { text: '⏳ Lagi diproses AI, tunggu sebentar ya...' }, { quoted: msg });
  let out;
  try {
    out = await viaNexa(key, buf);
  } catch (e) {
    if (!fallback) throw e;
    console.error(`[aiimage] ${key} API gagal, pakai efek lokal:`, e.message);
    out = await fallback(buf);
    caption += ' (efek lokal, API lagi gagal)';
  }
  return sendResult(sock, jid, msg, out, caption);
}

const cmdToAnime = (sock, msg, jid) => runStyle(sock, msg, jid, 'toanime', 'anime', '🎌 Jadi anime!', null);
const cmdToKartun = (sock, msg, jid) => runStyle(sock, msg, jid, 'tokartun', 'kartun', '🎨 Jadi kartun!', localCartoon);
const cmdTo3D = (sock, msg, jid) => runStyle(sock, msg, jid, 'to3d', 'tiga_d', '🧸 Jadi 3D Pixar!', null);

async function cmdLocal(sock, msg, jid, cmdName, fn, caption) {
  const buf = await getImage(msg);
  if (!buf) return sock.sendMessage(jid, { text: USAGE(cmdName) }, { quoted: msg });
  return sendResult(sock, jid, msg, await fn(buf), caption);
}
const cmdToSketsa = (sock, msg, jid) => cmdLocal(sock, msg, jid, 'tosketsa', localSketch, '✏️ Jadi sketsa pensil!');
const cmdToBW = (sock, msg, jid) => cmdLocal(sock, msg, jid, 'tohitamputih', localBW, '🖤 Jadi hitam putih!');

// .foto jadi anime|kartun|3d|pixar|sketsa|hitamputih
async function cmdFoto(sock, msg, jid, argText) {
  const m = (argText || '').toLowerCase().replace(/^jadi\s+/, '').trim();
  const map = {
    anime: cmdToAnime, kartun: cmdToKartun, cartoon: cmdToKartun, '3d': cmdTo3D, pixar: cmdTo3D,
    sketsa: cmdToSketsa, sketch: cmdToSketsa, 'hitam putih': cmdToBW, hitamputih: cmdToBW, bw: cmdToBW,
  };
  const fn = map[m];
  if (!fn) {
    return sock.sendMessage(jid, { text: '🎨 *.foto jadi <gaya>*\nGaya: anime, kartun, 3d (Pixar), sketsa, hitam putih\nContoh: *.foto jadi anime* (kirim/reply foto)\nAtau langsung: *.toanime* *.tokartun* *.to3d* *.tosketsa* *.tohitamputih*' }, { quoted: msg });
  }
  return fn(sock, msg, jid);
}

// .removebg / .hapus bg
async function cmdRemoveBg(sock, msg, jid) {
  const buf = await getImage(msg);
  if (!buf) return sock.sendMessage(jid, { text: USAGE('removebg') }, { quoted: msg });
  await sock.sendMessage(jid, { text: '⏳ Lagi hapus background...' }, { quoted: msg });
  const out = await viaNexa('removebg', buf);
  const sticker = await sharp(out).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toBuffer();
  await sock.sendMessage(jid, { document: await sharp(out).png().toBuffer(), mimetype: 'image/png', fileName: 'tanpa-background.png', caption: '✂️ Background dihapus (file PNG transparan)' }, { quoted: msg });
  await sock.sendMessage(jid, { sticker }, { quoted: msg });
}

// .wink / .remini : foto -> API Wink (HD 4x). Video -> mode lama.
async function cmdWinkApi(sock, msg, jid, argText, enhance, isRemini) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (media && media.type === 'videoMessage') return enhance.cmdWink(sock, msg, jid, argText);
  if (!media || media.type !== 'imageMessage') {
    return sock.sendMessage(jid, { text: 'Kirim/reply *foto* dengan caption *.wink* atau *.remini* (video: *.wink hd|2k|4k*)' }, { quoted: msg });
  }
  await sock.sendMessage(jid, { text: '⏳ Lagi di-HD-in pakai AI Wink, tunggu sebentar...' }, { quoted: msg });
  try {
    const out = await viaNexa('wink', media.buffer);
    const meta = await sharp(out).metadata();
    return sock.sendMessage(jid, { image: out, caption: `✨ HD (AI Wink) • ${meta.width}x${meta.height}` }, { quoted: msg });
  } catch (e) {
    console.error('[wink] API gagal, pakai mode lokal:', e.message);
    if (isRemini) return enhance.cmdRemini(sock, msg, jid);
    return enhance.cmdWink(sock, msg, jid, argText);
  }
}

module.exports = { cmdToAnime, cmdToKartun, cmdTo3D, cmdToSketsa, cmdToBW, cmdFoto, cmdRemoveBg, cmdWinkApi };
  
