const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const MAX_MB = 50;
const WA_VIDEO_LIMIT = 16 * 1024 * 1024;

function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, { timeout: 180000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message).split('\n').filter(Boolean).slice(-2).join(' ');
        return reject(new Error(msg.slice(0, 300)));
      }
      resolve(String(stdout));
    });
  });
}

async function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wadl-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function cleanError(e) {
  const m = String((e && e.message) || e);
  if (/not a bot|confirm you/i.test(m)) {
    return 'Server bot diblokir platform (diminta login/verifikasi). Biasanya terjadi di YouTube/Instagram dari server hosting.';
  }
  if (/login|log in|cookies|authentication|private/i.test(m)) {
    return 'Konten ini butuh login atau bersifat privat, jadi nggak bisa diunduh.';
  }
  if (/Unsupported URL/i.test(m)) return 'Link nggak dikenali. Pastikan link lengkap dan publik.';
  if (/no video|There is no video/i.test(m)) return 'Di link itu nggak ada video yang bisa diunduh.';
  return m.slice(0, 200);
}

function cookieArgs(dir) {
  const raw = process.env.YT_COOKIES;
  if (!raw) return [];
  const file = path.join(dir, 'cookies.txt');
  fs.writeFileSync(file, raw.replace(/\\n/g, '\n'));
  return ['--cookies', file];
}

async function fetchWithYtdlp(input, mode, dir) {
  const out = path.join(dir, 'media.%(ext)s');
  const base = ['--no-playlist', '--no-warnings', '--max-filesize', `${MAX_MB}M`, '-o', out, ...cookieArgs(dir)];
  const args =
    mode === 'audio'
      ? [...base, '-x', '--audio-format', 'mp3', '--audio-quality', '5', input]
      : [
          ...base,
          '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[ext=mp4]/b',
          '--merge-output-format', 'mp4',
          input,
        ];
  await runYtdlp(args);
  const file = fs.readdirSync(dir).find((f) => f.startsWith('media.'));
  if (!file) throw new Error(`Hasil unduhan nggak ketemu (mungkin lebih dari ${MAX_MB}MB).`);
  return path.join(dir, file);
}

async function downloadAndSend(sock, msg, jid, input, mode, caption) {
  await withTmp(async (dir) => {
    let file;
    try {
      file = await fetchWithYtdlp(input, mode, dir);
    } catch (e) {
      throw new Error(cleanError(e));
    }
    const buffer = fs.readFileSync(file);
    if (mode === 'audio') {
      return sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: msg });
    }
    if (buffer.length > WA_VIDEO_LIMIT) {
      return sock.sendMessage(
        jid,
        { document: buffer, mimetype: 'video/mp4', fileName: 'video.mp4', caption },
        { quoted: msg }
      );
    }
    return sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: msg });
  });
}

function needUrl(sock, msg, jid, text, example) {
  const url = (text || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    sock.sendMessage(jid, { text: `Contoh: *${example}*` }, { quoted: msg });
    return null;
  }
  return url;
}

// ---------- TikTok: tikwm.com dulu, kalau gagal pakai yt-dlp ----------
async function cmdTiktok(sock, msg, jid, text) {
  const url = needUrl(sock, msg, jid, text, '.tiktok https://vt.tiktok.com/xxxxx');
  if (!url) return;
  try {
    const { data } = await axios.get('https://www.tikwm.com/api/', {
      params: { url, hd: 1 },
      timeout: 20000,
      headers: { 'User-Agent': UA },
    });
    if (data && data.code === 0 && data.data) {
      const d = data.data;
      const full = (u) => (u.startsWith('http') ? u : 'https://www.tikwm.com' + u);
      const caption = `🎵 *${d.title || 'TikTok'}*\n👤 ${d.author?.nickname || '-'}\n❤️ ${d.digg_count || 0} | 💬 ${d.comment_count || 0}`;
      if (Array.isArray(d.images) && d.images.length) {
        for (const img of d.images.slice(0, 5)) {
          await sock.sendMessage(jid, { image: { url: full(img) } }, { quoted: msg });
        }
        return sock.sendMessage(jid, { text: caption }, { quoted: msg });
      }
      const videoUrl = d.play || d.hdplay;
      if (videoUrl) {
        return sock.sendMessage(jid, { video: { url: full(videoUrl) }, caption }, { quoted: msg });
      }
    } else {
      console.error('[tiktok] tikwm respons gagal:', JSON.stringify(data).slice(0, 300));
    }
  } catch (e) {
    console.error('[tiktok] tikwm gagal, lanjut ke yt-dlp:', e.message);
  }
  await downloadAndSend(sock, msg, jid, url, 'video', '🎵 TikTok');
}

// ---------- Instagram, Facebook, Twitter/X: yt-dlp ----------
async function cmdInstagram(sock, msg, jid, text) {
  const url = needUrl(sock, msg, jid, text, '.ig https://www.instagram.com/reel/xxxxx');
  if (!url) return;
  await downloadAndSend(sock, msg, jid, url, 'video', '📸 Instagram');
}

async function cmdFacebook(sock, msg, jid, text) {
  const url = needUrl(sock, msg, jid, text, '.fb https://www.facebook.com/watch?v=xxxxx');
  if (!url) return;
  await downloadAndSend(sock, msg, jid, url, 'video', '📘 Facebook');
}

async function cmdTwitter(sock, msg, jid, text) {
  const url = needUrl(sock, msg, jid, text, '.twitter https://x.com/user/status/xxxxx');
  if (!url) return;
  await downloadAndSend(sock, msg, jid, url, 'video', '🐦 Twitter/X');
}

// ---------- YouTube: link atau judul (mode: video / audio) ----------
async function cmdYoutube(sock, msg, jid, text, mode = 'video') {
  const q = (text || '').trim();
  if (!q) {
    const ex = mode === 'audio' ? '.ytmp3 https://youtu.be/xxxxx  atau  .play judul lagu' : '.yt https://youtu.be/xxxxx';
    return sock.sendMessage(jid, { text: `Contoh: *${ex}*` }, { quoted: msg });
  }
  const input = /^https?:\/\//i.test(q) ? q : `ytsearch1:${q}`;
  await downloadAndSend(sock, msg, jid, input, mode, '▶️ YouTube');
}

async function cmdPlay(sock, msg, jid, text) {
  return cmdYoutube(sock, msg, jid, text, 'audio');
}

// ---------- Pinterest: video lewat yt-dlp, gambar lewat halaman pin ----------
async function cmdPinterest(sock, msg, jid, text) {
  const url = needUrl(sock, msg, jid, text, '.pinterest https://pin.it/xxxxx');
  if (!url) return;
  try {
    await downloadAndSend(sock, msg, jid, url, 'video', '📌 Pinterest');
    return;
  } catch (e) {
    // bukan video, coba ambil gambarnya
  }
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 20000,
    maxRedirects: 5,
  });
  const m =
    String(html).match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    String(html).match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!m) throw new Error('Nggak nemu gambar atau video di link Pinterest itu.');
  await sock.sendMessage(
    jid,
    { image: { url: m[1].replace(/&amp;/g, '&') }, caption: '📌 Pinterest' },
    { quoted: msg }
  );
}

module.exports = {
  cmdTiktok,
  cmdInstagram,
  cmdFacebook,
  cmdYoutube,
  cmdPlay,
  cmdPinterest,
  cmdTwitter,
};
