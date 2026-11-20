const sharp = require('sharp');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

const LEVELS = {
  hd: { edge: 1920, height: 1080 },
  '2k': { edge: 2560, height: 1440 },
  '4k': { edge: 3840, height: 2160 },
};
const ALIASES = { fhd: 'hd', '1080': 'hd', '1080p': 'hd', qhd: '2k', '1440': '2k', '1440p': '2k', uhd: '4k', '2160': '4k', '2160p': '4k' };

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 170000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('ffmpeg gagal: ' + String(stderr || err.message).slice(-200)));
      resolve();
    });
  });
}

async function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waenh-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Perbesar + pertajam gambar (Lanczos + unsharp). Ini bukan AI, tapi hasilnya nyata & selalu jalan.
async function enhanceImage(buffer, { edge, factor, sigma }) {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('Gambar tidak terbaca.');
  if (meta.width * meta.height > 20000000) throw new Error('Gambar terlalu besar (maksimal sekitar 20 megapiksel).');
  const swapped = meta.orientation && meta.orientation >= 5;
  const baseW = swapped ? meta.height : meta.width;
  const baseH = swapped ? meta.width : meta.height;
  const longEdge = Math.max(baseW, baseH);
  let scale = factor || edge / longEdge;
  scale = Math.min(Math.max(scale, 1), 4);
  if (longEdge * scale > 4096) scale = 4096 / longEdge;
  const width = Math.round(baseW * scale);
  const height = Math.round(baseH * scale);
  const out = await sharp(buffer)
    .rotate()
    .resize(width, height, { kernel: 'lanczos3' })
    .modulate({ brightness: 1.02, saturation: 1.08 })
    .sharpen({ sigma: sigma || 1.1, m1: 0.8, m2: 2 })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { buffer: out, width, height };
}

async function enhanceVideo(buffer, level) {
  if (level === '4k') {
    throw new Error('Video 4K terlalu berat buat server. Untuk video pakai .wink hd atau .wink 2k.');
  }
  if (buffer.length > 30 * 1024 * 1024) throw new Error('Video terlalu besar (maksimal 30MB).');
  const cfg = LEVELS[level];
  return withTmp(async (dir) => {
    const input = path.join(dir, 'in.mp4');
    const output = path.join(dir, 'out.mp4');
    fs.writeFileSync(input, buffer);
    await runFfmpeg([
      '-i', input,
      '-t', '15',
      '-vf', `scale=-2:'max(ih,${cfg.height})':flags=lanczos,unsharp=5:5:0.9:5:5:0.0`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      output,
    ]);
    return fs.readFileSync(output);
  });
}

async function sendImageResult(sock, jid, msg, result, name, caption, forceDoc) {
  const asDoc = forceDoc || Math.max(result.width, result.height) > 2000;
  if (asDoc) {
    return sock.sendMessage(
      jid,
      { document: result.buffer, mimetype: 'image/jpeg', fileName: `${name}.jpg`, caption: caption + '\n_(dikirim sebagai file supaya resolusinya utuh)_' },
      { quoted: msg }
    );
  }
  return sock.sendMessage(jid, { image: result.buffer, caption }, { quoted: msg });
}

// .wink hd | 2k | 4k  (kirim/reply foto atau video)
async function cmdWink(sock, msg, jid, argText) {
  let level = ((argText || 'hd').trim().toLowerCase().split(/\s+/)[0]) || 'hd';
  level = ALIASES[level] || level;
  if (!LEVELS[level]) {
    return sock.sendMessage(
      jid,
      { text: 'Pilih kualitas: *hd*, *2k*, atau *4k*\nContoh: *.wink 2k* (kirim/reply foto atau video)' },
      { quoted: msg }
    );
  }
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || (media.type !== 'imageMessage' && media.type !== 'videoMessage')) {
    return sock.sendMessage(jid, { text: 'Kirim/reply foto atau video dengan caption *.wink hd* / *.wink 2k* / *.wink 4k*' }, { quoted: msg });
  }

  if (media.type === 'imageMessage') {
    const result = await enhanceImage(media.buffer, { edge: LEVELS[level].edge });
    return sendImageResult(
      sock, jid, msg, result, `wink-${level}`,
      `✨ Wink ${level.toUpperCase()} • ${result.width}x${result.height}`,
      level !== 'hd'
    );
  }

  const out = await enhanceVideo(media.buffer, level);
  const caption = `✨ Wink ${level.toUpperCase()} (video)`;
  if (out.length > 16 * 1024 * 1024) {
    return sock.sendMessage(jid, { document: out, mimetype: 'video/mp4', fileName: `wink-${level}.mp4`, caption }, { quoted: msg });
  }
  return sock.sendMessage(jid, { video: out, mimetype: 'video/mp4', caption }, { quoted: msg });
}

// .remini (kirim/reply foto): perbesar 2x + pertajam
async function cmdRemini(sock, msg, jid) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || media.type !== 'imageMessage') {
    return sock.sendMessage(jid, { text: 'Kirim/reply foto dengan caption *.remini*' }, { quoted: msg });
  }
  const result = await enhanceImage(media.buffer, { factor: 2, sigma: 1.3 });
  return sendImageResult(sock, jid, msg, result, 'remini', `✨ HD • ${result.width}x${result.height}`, false);
}

module.exports = { cmdWink, cmdRemini };
