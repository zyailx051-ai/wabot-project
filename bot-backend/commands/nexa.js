const axios = require('axios');
const sharp = require('sharp');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sticker = require('./sticker');
const { nexaGet, parseJson } = require('../lib/nexaHttp');
const { cmdNokia } = require('./nokia');

const NEXA_BASE = (process.env.NEXA_BASE || 'https://api.nexadev.my.id').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const MAX_BYTES = 40 * 1024 * 1024;

function sniff(buf, contentType = '') {
  if (!buf || buf.length < 12) return 'unknown';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') return 'mp4';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  if (String(contentType).startsWith('video/')) return 'mp4';
  return 'unknown';
}

function findUrl(obj, depth = 0) {
  if (!obj || depth > 4) return null;
  if (typeof obj === 'string') return /^https?:\/\//i.test(obj) ? obj : null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const u = findUrl(v, depth + 1);
      if (u) return u;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const k of ['url', 'result', 'image', 'video', 'link', 'download', 'data']) {
      if (k in obj) {
        const u = findUrl(obj[k], depth + 1);
        if (u) return u;
      }
    }
    for (const v of Object.values(obj)) {
      const u = findUrl(v, depth + 1);
      if (u) return u;
    }
  }
  return null;
}

// Panggil API Nexa. Hasilnya bisa langsung berupa file (gambar/video) atau JSON berisi link file.
async function fetchNexa(url) {
  const u = new URL(url);
  const res = await nexaGet(u.pathname + u.search, null, { timeout: 60000, maxBytes: MAX_BYTES });
  if (res.status >= 400) throw new Error(`API error ${res.status}`);
  let contentType = String(res.headers['content-type'] || '').toLowerCase();
  let buffer = Buffer.from(res.data);

  if (contentType.includes('json') || contentType.startsWith('text/')) {
    const json = parseJson(res);
    if (!json) throw new Error('Respons API tidak valid');
    const link = findUrl(json);
    if (!link) throw new Error(String(json.message || json.error || 'API tidak mengembalikan hasil'));
    const r2 = await axios.get(link, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: MAX_BYTES,
      headers: { 'User-Agent': UA },
    });
    buffer = Buffer.from(r2.data);
    contentType = String(r2.headers['content-type'] || '').toLowerCase();
  }
  return { buffer, contentType };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('ffmpeg gagal: ' + String(stderr || err.message).slice(-200)));
      resolve();
    });
  });
}

async function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wanx-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function mediaToStickerWebp({ buffer, contentType }) {
  const kind = sniff(buffer, contentType);
  if (kind === 'webp') return buffer;
  if (kind === 'png' || kind === 'jpg') {
    return sharp(buffer)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80 })
      .toBuffer();
  }
  if (kind === 'unknown') throw new Error('Format hasil API tidak dikenali');
  return withTmp(async (dir) => {
    const input = path.join(dir, 'in.bin');
    const output = path.join(dir, 'out.webp');
    fs.writeFileSync(input, buffer);
    let out;
    for (const a of [{ fps: 12, q: 50 }, { fps: 8, q: 30 }]) {
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

// .bratvid2: digambar langsung pakai canvas (tanpa API), tampilan mengikuti referensi.
const { cmdBratVid2 } = require('./bratcanvas');

module.exports = { cmdBratVid2, cmdNokia, fetchNexa, sniff, findUrl };
    
