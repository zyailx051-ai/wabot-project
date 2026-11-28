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
  if (/IP address is blocked|blocked from accessing/i.test(m)) return 'IP server bot diblokir oleh platform ini (umum terjadi di server hosting).';
  if (/login|log in|cookies|authentication|private/i.test(m)) {
    return 'Konten ini butuh login atau bersifat privat, jadi nggak bisa diunduh.';
  }
  if (/Unsupported URL/i.test(m)) return 'Link nggak dikenali. Pastikan link lengkap dan publik.';
  if (/no video|There is no video/i.test(m)) return 'Di link itu nggak ada video yang bisa diunduh.';
  return m.slice(0, 200);
}

function cookieArgs(dir, input = '') {
  // Cookie per platform: IG_COOKIES / FB_COOKIES / TW_COOKIES / YT_COOKIES (format Netscape cookies.txt)
  let raw = process.env.YT_COOKIES;
  if (/instagram\.com/i.test(input)) raw = process.env.IG_COOKIES || raw;
  else if (/facebook\.com|fb\.watch/i.test(input)) raw = process.env.FB_COOKIES || raw;
  else if (/twitter\.com|x\.com/i.test(input)) raw = process.env.TW_COOKIES || raw;
  if (!raw) return [];
  const file = path.join(dir, 'cookies.txt');
  fs.writeFileSync(file, raw.replace(/\\n/g, '\n'));
  return ['--cookies', file];
}

async function fetchWithYtdlp(input, mode, dir) {
  const out = path.join(dir, 'media.%(ext)s');
  const base = ['--no-playlist', '--no-warnings', '--max-filesize', `${MAX_MB}M`, '-o', out, ...cookieArgs(dir, input)];
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shortErr = (e) => (e.response?.status ? `HTTP ${e.response.status}` : String(e.message || e)).slice(0, 70);

// Ikuti redirect link pendek (vt.tiktok.com / vm.tiktok.com) jadi link panjang
async function resolveTiktokUrl(url) {
  try {
    const res = await axios.get(url, { maxRedirects: 5, timeout: 15000, headers: { 'User-Agent': UA }, validateStatus: () => true });
    const finalUrl = res.request?.res?.responseUrl;
    if (finalUrl && /tiktok\.com/.test(finalUrl)) return finalUrl.split('?')[0];
  } catch (e) {
    console.error('[tiktok] gagal resolve link pendek:', e.message);
  }
  return url;
}

async function fetchBuffer(u, headers = {}) {
  const { data } = await axios.get(u, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 60 * 1024 * 1024, headers: { 'User-Agent': UA, ...headers } });
  return Buffer.from(data);
}

// ----- sumber 1 & 2: TikWM (dua host) -----
async function ttTikwm(url, host) {
  let reason = 'tanpa respons';
  for (let i = 0; i < 2; i++) {
    try {
      const body = new URLSearchParams({ url, hd: '1' }).toString();
      const { data } = await axios.post(`https://${host}/api/`, body, {
        timeout: 25000,
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: `https://${host}/` },
      });
      if (data && data.code === 0 && data.data) {
        const d = data.data;
        const full = (u) => (u.startsWith('http') ? u : `https://${host}${u}`);
        return {
          title: d.title, author: d.author?.nickname, likes: d.digg_count, comments: d.comment_count,
          images: Array.isArray(d.images) && d.images.length ? d.images.map(full) : null,
          videoUrl: d.images?.length ? null : full(d.hdplay || d.play || ''),
          headers: { Referer: `https://${host}/` },
        };
      }
      reason = String(data?.msg || JSON.stringify(data)).slice(0, 80);
    } catch (e) {
      reason = shortErr(e);
    }
    await sleep(1500); // TikWM gratis dibatasi ~1 request/detik
  }
  throw new Error(reason);
}

// ----- sumber 3: API internal TikTok (aweme) lewat ID video -----
const randDigits = (n) => '7' + Array.from({ length: n - 1 }, () => Math.floor(Math.random() * 10)).join('');
const AWEME_HOSTS = ['api22-normal-c-alisg.tiktokv.com', 'api16-normal-c-useast1a.tiktokv.com', 'api19-normal-c-useast1a.tiktokv.com', 'api31-normal-useast2a.tiktokv.com'];
function videoIdFrom(fullUrl) {
  const m = fullUrl.match(/\/(?:video|photo)\/(\d{10,})/) || fullUrl.match(/(\d{15,})/);
  return m ? m[1] : null;
}
async function ttAweme(fullUrl) {
  const id = videoIdFrom(fullUrl);
  if (!id) throw new Error('ID video nggak ketemu di link');
  const mobileUA = 'com.zhiliaoapp.musically/300904 (Linux; U; Android 9; en_US; ASUS_Z01QD; Build/PQ3A.190801.002;tt-ok/3.12.13.1)';
  let lastErr = 'tanpa respons';
  for (const host of AWEME_HOSTS) {
    try {
      const { data } = await axios.get(`https://${host}/aweme/v1/feed/`, {
        timeout: 15000,
        headers: { 'User-Agent': mobileUA },
        params: { aweme_id: id, iid: randDigits(19), device_id: randDigits(19), channel: 'googleplay', app_name: 'musical_ly', version_code: '300904', device_platform: 'android', device_type: 'ASUS_Z01QD', os_version: '9', aid: '1128' },
      });
      const a = data?.aweme_list?.[0];
      if (!a || String(a.aweme_id) !== id) { lastErr = 'video nggak ditemukan / dibatasi'; continue; }
      const imgs = a.image_post_info?.images?.map((i) => i.display_image?.url_list?.[0]).filter(Boolean);
      const vid = a.video?.play_addr?.url_list?.[0] || a.video?.download_addr?.url_list?.[0];
      if (!vid && !(imgs && imgs.length)) { lastErr = 'tanpa link video'; continue; }
      return {
        title: a.desc, author: a.author?.nickname, likes: a.statistics?.digg_count, comments: a.statistics?.comment_count,
        images: imgs && imgs.length ? imgs : null, videoUrl: imgs && imgs.length ? null : vid, headers: { 'User-Agent': mobileUA },
      };
    } catch (e) {
      lastErr = shortErr(e);
    }
    await sleep(600);
  }
  throw new Error(lastErr);
}

// ----- sumber: Tiklydown -----
async function ttTiklydown(url) {
  const { data } = await axios.get('https://api.tiklydown.eu.org/api/download/v3', { params: { url }, timeout: 20000, headers: { 'User-Agent': UA } });
  const v = data?.video?.noWatermark || data?.video?.watermark;
  const imgs = Array.isArray(data?.images) ? data.images.map((i) => i.url || i).filter(Boolean) : null;
  if (!v && !(imgs && imgs.length)) throw new Error('tanpa link video');
  return { title: data.title || data.desc, author: data.author?.name, videoUrl: imgs && imgs.length ? null : v, images: imgs && imgs.length ? imgs : null, headers: {} };
}

// ----- sumber: media langsung TikWM (jalur CDN, kadang lolos walau API-nya 403) -----
async function ttTikwmMedia(fullUrl) {
  const id = videoIdFrom(fullUrl);
  if (!id) throw new Error('ID video nggak ketemu');
  for (const kind of ['hdplay', 'play']) {
    const u = `https://www.tikwm.com/video/media/${kind}/${id}.mp4`;
    try {
      const r = await axios.head(u, { timeout: 15000, headers: { 'User-Agent': UA }, maxRedirects: 5 });
      if (r.status === 200 && /video|octet/i.test(String(r.headers['content-type'] || ''))) return { title: 'TikTok', videoUrl: u, headers: { Referer: 'https://www.tikwm.com/' } };
    } catch (e) { /* coba berikutnya */ }
  }
  throw new Error('media nggak tersedia');
}

// ----- sumber 4: LoveTik -----
async function ttLovetik(url) {
  const { data } = await axios.post('https://lovetik.com/api/ajax/search', new URLSearchParams({ query: url }).toString(), {
    timeout: 25000,
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: 'https://lovetik.com/' },
  });
  if (!data || data.status !== 'ok') throw new Error(String(data?.mess || 'respons gagal').slice(0, 80));
  const links = Array.isArray(data.links) ? data.links : [];
  const mp4 = links.find((l) => /mp4/i.test(l.t || '') && /^https?:/.test(l.a || '')) || links.find((l) => /^https?:/.test(l.a || ''));
  if (!mp4) throw new Error('tanpa link video');
  return { title: data.desc, author: data.author, videoUrl: mp4.a, headers: {} };
}

// Cari media TikTok dari beberapa sumber. Return { r, reasons } atau lempar Error berisi alasan semua sumber.
async function getTiktokMedia(url) {
  const fullUrl = await resolveTiktokUrl(url);
  const sources = [
    ['TikTok-API', () => ttAweme(fullUrl)],
    ['Tiklydown', () => ttTiklydown(fullUrl)],
    ['TikWM', () => ttTikwm(fullUrl, 'www.tikwm.com')],
    ['TikWM-media', () => ttTikwmMedia(fullUrl)],
    ['LoveTik', () => ttLovetik(fullUrl)],
  ];
  const reasons = [];
  for (const [name, fn] of sources) {
    try {
      const r = await fn();
      return { r, fullUrl, reasons };
    } catch (e) {
      reasons.push(`${name}: ${shortErr(e)}`);
      console.error(`[tiktok] ${name} gagal:`, e.message);
    }
  }
  const err = new Error('Semua sumber TikTok gagal');
  err.reasons = reasons;
  err.fullUrl = fullUrl;
  throw err;
}

async function cmdTiktok(sock, msg, jid, text) {
  const url = needUrl(sock, msg, jid, text, '.tiktok https://vt.tiktok.com/xxxxx');
  if (!url) return;
  let found;
  try {
    found = await getTiktokMedia(url);
  } catch (e) {
    const reasons = e.reasons || [];
    try {
      return await downloadAndSend(sock, msg, jid, e.fullUrl || url, 'video', '🎵 TikTok');
    } catch (e2) {
      reasons.push(`yt-dlp: ${String(e2.message).slice(0, 90)}`);
    }
    throw new Error('Semua sumber TikTok gagal:\n• ' + reasons.join('\n• ') + '\n\nKemungkinan besar IP server diblokir TikTok. Coba lagi beberapa menit lagi.');
  }
  const { r } = found;
  const caption = `🎵 *${r.title || 'TikTok'}*\n👤 ${r.author || '-'}${r.likes != null ? `\n❤️ ${r.likes} | 💬 ${r.comments || 0}` : ''}`;
  if (r.images) {
    for (const img of r.images.slice(0, 6)) await sock.sendMessage(jid, { image: await fetchBuffer(img, r.headers) }, { quoted: msg });
    return sock.sendMessage(jid, { text: caption }, { quoted: msg });
  }
  return sock.sendMessage(jid, { video: await fetchBuffer(r.videoUrl, r.headers), caption }, { quoted: msg });
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

// .aio — kenali link otomatis lalu arahkan ke downloader yang sesuai
async function cmdAio(sock, msg, jid, text, quotedText = '') {
  const url = (String(text || '').match(/https?:\/\/\S+/) || String(quotedText || '').match(/https?:\/\/\S+/) || [])[0];
  if (!url) {
    return sock.sendMessage(jid, { text: '📥 *.aio <link>*\nKirim link TikTok, Instagram, Facebook, YouTube, Twitter/X, atau Pinterest — bot otomatis mengenalinya.\nBisa juga reply pesan yang berisi link lalu ketik *.aio*' }, { quoted: msg });
  }
  let host = '';
  try { host = new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile|vt|vm|web)\./, ''); } catch (e) { /* kosong */ }
  const is = (...d) => d.some((x) => host === x || host.endsWith('.' + x));
  if (is('tiktok.com')) return cmdTiktok(sock, msg, jid, url);
  if (is('instagram.com', 'instagr.am')) return cmdInstagram(sock, msg, jid, url);
  if (is('facebook.com', 'fb.watch', 'fb.com')) return cmdFacebook(sock, msg, jid, url);
  if (is('youtube.com', 'youtu.be')) return cmdYoutube(sock, msg, jid, url, 'video');
  if (is('twitter.com', 'x.com', 't.co')) return cmdTwitter(sock, msg, jid, url);
  if (is('pinterest.com', 'pin.it')) return cmdPinterest(sock, msg, jid, url);
  return sock.sendMessage(jid, { text: '❌ Link ini belum didukung.\nYang didukung: TikTok, Instagram, Facebook, YouTube, Twitter/X, Pinterest.' }, { quoted: msg });
}

module.exports = {
  cmdAio,
  cmdTiktok,
  cmdInstagram,
  cmdFacebook,
  cmdYoutube,
  cmdPlay,
  cmdPinterest,
  cmdTwitter, getTiktokMedia, fetchBuffer, resolveTiktokUrl };

