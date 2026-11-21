const axios = require('axios');
const sharp = require('sharp');

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => (n === undefined || n === null ? '-' : Number(n).toLocaleString('id-ID'));

async function download(url, maxMB = 14) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: maxMB * 1024 * 1024,
    headers: { 'User-Agent': UA, Referer: 'https://www.google.com/' },
  });
  return Buffer.from(res.data);
}

// ---------------- .ttstalk ----------------
async function tikwmUser(username) {
  const { data } = await axios.get('https://www.tikwm.com/api/user/info', {
    params: { unique_id: username },
    timeout: 20000,
    headers: { 'User-Agent': UA },
  });
  if (!data || data.code !== 0 || !data.data || !data.data.user) throw new Error('tikwm: akun tidak ditemukan');
  const u = data.data.user;
  const s = data.data.stats || {};
  return {
    id: u.id,
    username: u.uniqueId,
    nickname: u.nickname,
    bio: u.signature,
    verified: !!u.verified,
    avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb,
    followers: s.followerCount,
    following: s.followingCount,
    likes: s.heartCount !== undefined ? s.heartCount : s.heart,
    videos: s.videoCount,
  };
}

async function pageUser(username) {
  const { data } = await axios.get(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
    timeout: 20000,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const m = String(data).match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('halaman TikTok tidak bisa dibaca');
  const json = JSON.parse(m[1]);
  const info = json.__DEFAULT_SCOPE__ && json.__DEFAULT_SCOPE__['webapp.user-detail'] && json.__DEFAULT_SCOPE__['webapp.user-detail'].userInfo;
  if (!info || !info.user) throw new Error('akun tidak ditemukan');
  const u = info.user;
  const s = info.stats || {};
  return {
    id: u.id,
    username: u.uniqueId,
    nickname: u.nickname,
    bio: u.signature,
    verified: !!u.verified,
    avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb,
    followers: s.followerCount,
    following: s.followingCount,
    likes: s.heartCount !== undefined ? s.heartCount : s.heart,
    videos: s.videoCount,
  };
}

async function cmdTtStalk(sock, msg, jid, argText) {
  const username = (argText || '').trim().replace(/^@/, '').split(/\s+/)[0];
  if (!username) return sock.sendMessage(jid, { text: 'Contoh: *.ttstalk username*' }, { quoted: msg });
  if (!/^[A-Za-z0-9._]{2,40}$/.test(username)) throw new Error('Username TikTok tidak valid.');

  let info = null;
  try {
    info = await tikwmUser(username);
  } catch (e) {
    try {
      info = await pageUser(username);
    } catch (e2) {
      throw new Error(`Akun @${username} tidak ditemukan, diprivat, atau TikTok sedang memblokir permintaan. Coba lagi nanti.`);
    }
  }

  const caption =
    `👤 *TikTok Profile*\n\n` +
    `• Nama: ${info.nickname || '-'}\n` +
    `• Username: @${info.username}\n` +
    `• User ID: ${info.id || '-'}\n` +
    `• Verifikasi: ${info.verified ? '✅ Terverifikasi' : '❌ Belum'}\n` +
    `• Pengikut: ${fmt(info.followers)}\n` +
    `• Mengikuti: ${fmt(info.following)}\n` +
    `• Total Suka: ${fmt(info.likes)}\n` +
    `• Total Video: ${fmt(info.videos)}\n` +
    `• Bio: ${info.bio ? info.bio : '-'}\n\n` +
    `🔗 https://www.tiktok.com/@${info.username}`;

  if (info.avatar) {
    try {
      const raw = await download(info.avatar, 8);
      let img = raw;
      try {
        img = await sharp(raw).jpeg({ quality: 90 }).toBuffer();
      } catch (e) {
        // pakai file asli kalau konversi gagal
      }
      return sock.sendMessage(jid, { image: img, caption }, { quoted: msg });
    } catch (e) {
      // foto profil gagal diambil, kirim teks saja
    }
  }
  await sock.sendMessage(jid, { text: caption }, { quoted: msg });
}

// ---------------- util: acak tanpa pengulangan ----------------
const recent = { anime: [], meme: [] }; // yang baru dikirim, supaya tidak muncul lagi
const wasRecent = (kind, key) => recent[kind].includes(key);
function remember(kind, key) {
  recent[kind].push(key);
  if (recent[kind].length > 200) recent[kind].shift();
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------- .rndmanime ----------------
// .rndmanime            -> wallpaper HP (portrait), terbaik dulu (urut favorit), halaman acak
// .rndmanime pc         -> wallpaper layar lebar
// .rndmanime <kata>     -> cari tema, mis. ".rndmanime night city"
// tambah kata "file"    -> dikirim sebagai file asli (kualitas penuh, tidak dikompres WhatsApp)
async function wallhavenList(orientation, query) {
  const base = {
    categories: '010', // anime saja
    purity: '100', // aman (SFW)
    sorting: 'favorites',
    order: 'desc',
    ratios: orientation,
    atleast: orientation === 'portrait' ? '1080x1920' : '1920x1080',
  };
  if (query) base.q = query;
  const maxPage = query ? 5 : 25;
  const page = 1 + Math.floor(Math.random() * maxPage);
  for (const pg of [page, 1]) {
    const { data } = await axios.get('https://wallhaven.cc/api/v1/search', {
      params: { ...base, page: pg },
      timeout: 20000,
      headers: { 'User-Agent': UA },
    });
    const list = ((data && data.data) || []).filter((x) => x && x.path && (!x.file_size || x.file_size < 13 * 1024 * 1024));
    if (list.length) return list;
  }
  throw new Error('wallhaven kosong');
}

async function fallbackArt() {
  const { data } = await axios.get(`https://nekos.best/api/v2/${pick(['waifu', 'husbando', 'kitsune', 'neko'])}`, {
    timeout: 20000,
    headers: { 'User-Agent': UA },
  });
  const r = data && data.results && data.results[0];
  if (!r || !r.url) throw new Error('nekos.best kosong');
  return { id: r.url, url: r.url, caption: `🌸 Anime Art${r.artist_name ? '\n🎨 ' + r.artist_name : ''}${r.source_url ? '\n🔗 ' + r.source_url : ''}` };
}

async function cmdRandomAnime(sock, msg, jid, argText = '') {
  const words = String(argText || '').toLowerCase().split(/\s+/).filter(Boolean);
  const asFile = words.includes('file');
  const orientation = words.includes('pc') ? 'landscape' : 'portrait';
  const query = words.filter((w) => w !== 'file' && w !== 'pc').join(' ');

  let candidates = [];
  try {
    const list = await wallhavenList(orientation, query);
    const fresh = shuffle(list).filter((x) => !wasRecent('anime', x.id));
    candidates = (fresh.length ? fresh : shuffle(list)).slice(0, 4).map((p) => ({
      id: p.id,
      url: p.path,
      caption: `🌸 Anime Wallpaper ${orientation === 'portrait' ? '(HP)' : '(PC)'}\n📐 ${p.resolution || ''}  ❤️ ${p.favorites ?? '-'}\n🔗 ${p.url || ''}`,
    }));
  } catch (e) {
    console.error('[rndmanime] wallhaven gagal:', e.message);
  }

  let lastErr;
  const tryList = [...candidates, { lazy: fallbackArt }];
  for (let item of tryList) {
    try {
      if (item.lazy) item = await item.lazy();
      const raw = await download(item.url, 14);
      remember('anime', item.id);
      if (asFile) {
        const ext = (item.url.match(/\.(jpe?g|png|webp)(\?|$)/i) || [, 'jpg'])[1].toLowerCase();
        return await sock.sendMessage(
          jid,
          { document: raw, mimetype: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', fileName: `anime-${item.id}.${ext}`, caption: item.caption },
          { quoted: msg }
        );
      }
      let img = raw;
      try {
        img = await sharp(raw).resize({ width: 1600, height: 2560, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      } catch (e) {
        // pakai file asli kalau konversi gagal
      }
      return await sock.sendMessage(jid, { image: img, caption: item.caption + '\n_Mau kualitas penuh? ketik .rndmanime file_' }, { quoted: msg });
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('Sumber gambar anime lagi nggak bisa dihubungi. Coba lagi sebentar. (' + (lastErr ? lastErr.message : '') + ')');
}

// ---------------- .rndmmeme ----------------
// Kumpulkan banyak meme sekaligus dari beberapa subreddit Indonesia, simpan 10 menit,
// lalu kirim satu per satu secara acak TANPA mengulang yang baru dikirim.
// Daftar subreddit bisa diganti lewat variabel MEME_SUBS di Railway (pisah koma).
const MEME_SUBS = (process.env.MEME_SUBS || 'indonesia,indowibu,indonesian,dagelan').split(',').map((s) => s.trim()).filter(Boolean);
const memePool = { time: 0, items: [] };
const IMG_RE = /\.(jpe?g|png|webp)(\?|$)/i;

async function fetchSub(sub) {
  const { data } = await axios.get(`https://meme-api.com/gimme/${encodeURIComponent(sub)}/50`, {
    timeout: 25000,
    headers: { 'User-Agent': UA },
  });
  const list = (data && data.memes) || (data && data.url ? [data] : []);
  return list.filter((m) => m && !m.nsfw && !m.spoiler && IMG_RE.test(m.url || ''));
}

async function loadMemePool() {
  if (memePool.items.length >= 8 && Date.now() - memePool.time < 10 * 60 * 1000) return memePool.items;
  const results = await Promise.allSettled(MEME_SUBS.map(fetchSub));
  const seen = new Set();
  const items = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') {
      console.log('[rndmmeme] r/' + MEME_SUBS[i] + ' dilewati:', r.reason && r.reason.message);
      return;
    }
    for (const m of r.value) {
      if (seen.has(m.url)) continue;
      seen.add(m.url);
      items.push({ ...m, label: 'r/' + (m.subreddit || MEME_SUBS[i]) });
    }
  });
  console.log('[rndmmeme] kumpulan meme:', items.length);
  if (items.length) {
    memePool.items = items;
    memePool.time = Date.now();
  }
  return memePool.items;
}

async function cmdRandomMeme(sock, msg, jid) {
  let pool = await loadMemePool();
  let general = false;
  if (!pool.length) {
    // sumber Indonesia kosong semua -> pakai meme umum
    try {
      const { data } = await axios.get('https://meme-api.com/gimme/50', { timeout: 25000, headers: { 'User-Agent': UA } });
      pool = ((data && data.memes) || []).filter((m) => m && !m.nsfw && !m.spoiler && IMG_RE.test(m.url || '')).map((m) => ({ ...m, label: 'r/' + m.subreddit }));
      general = true;
    } catch (e) {
      // lanjut ke error di bawah
    }
  }
  if (!pool.length) throw new Error('Sumber meme lagi nggak bisa dihubungi. Coba lagi sebentar.');

  let order = shuffle(pool);
  const fresh = order.filter((m) => !wasRecent('meme', m.url));
  if (fresh.length) order = fresh;
  else recent.meme.length = 0; // semua sudah pernah keluar, mulai putaran baru

  for (const m of order.slice(0, 6)) {
    try {
      const buf = await download(m.url, 14);
      remember('meme', m.url);
      return await sock.sendMessage(
        jid,
        { image: buf, caption: `😂 ${m.title || 'Meme'}\n_(${m.label}${general ? ' — meme umum, sumber Indonesia lagi kosong' : ''})_` },
        { quoted: msg }
      );
    } catch (e) {
      // gambar ini gagal diunduh, coba yang lain
    }
  }
  throw new Error('Gagal mengunduh gambar meme. Coba lagi sebentar.');
}

module.exports = { cmdTtStalk, cmdRandomAnime, cmdRandomMeme };
  
