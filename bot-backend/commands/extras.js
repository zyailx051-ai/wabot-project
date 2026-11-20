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

// ---------------- .rndmanime ----------------
async function animeWallhaven() {
  const { data } = await axios.get('https://wallhaven.cc/api/v1/search', {
    params: { q: 'anime', categories: '010', purity: '100', sorting: 'random', atleast: '1920x1080' },
    timeout: 20000,
    headers: { 'User-Agent': UA },
  });
  const list = (data && data.data) || [];
  if (!list.length) throw new Error('wallhaven kosong');
  const p = pick(list);
  return { url: p.path, caption: `🌸 Anime Wallpaper\n📐 ${p.resolution || ''}\n🔗 ${p.url || ''}` };
}

async function animeNekos() {
  const { data } = await axios.get(`https://nekos.best/api/v2/${pick(['neko', 'waifu', 'husbando', 'kitsune'])}`, {
    timeout: 20000,
    headers: { 'User-Agent': UA },
  });
  const r = data && data.results && data.results[0];
  if (!r || !r.url) throw new Error('nekos.best kosong');
  return { url: r.url, caption: `🌸 Anime Art${r.artist_name ? '\n🎨 ' + r.artist_name : ''}${r.source_url ? '\n🔗 ' + r.source_url : ''}` };
}

async function animeWaifuPics() {
  const { data } = await axios.get(`https://api.waifu.pics/sfw/${pick(['waifu', 'neko', 'shinobu', 'megumin'])}`, {
    timeout: 20000,
    headers: { 'User-Agent': UA },
  });
  if (!data || !data.url) throw new Error('waifu.pics kosong');
  return { url: data.url, caption: '🌸 Anime Art' };
}

async function cmdRandomAnime(sock, msg, jid) {
  let lastErr;
  for (const source of [animeWallhaven, animeNekos, animeWaifuPics]) {
    try {
      const item = await source();
      const buf = await download(item.url, 14);
      return await sock.sendMessage(jid, { image: buf, caption: item.caption }, { quoted: msg });
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('Semua sumber gambar anime lagi nggak bisa dihubungi. Coba lagi sebentar. (' + (lastErr ? lastErr.message : '') + ')');
}

// ---------------- .rndmmeme ----------------
const MEME_SUBS = (process.env.MEME_SUBS || 'indonesia,indowibu').split(',').map((s) => s.trim()).filter(Boolean);

async function memeFrom(path) {
  const { data } = await axios.get(`https://meme-api.com/gimme/${path}`, { timeout: 20000, headers: { 'User-Agent': UA } });
  const memes = ((data && data.memes) || []).filter(
    (m) => m && !m.nsfw && !m.spoiler && /\.(jpe?g|png|webp)(\?|$)/i.test(m.url || '')
  );
  if (!memes.length) throw new Error('kosong');
  return pick(memes);
}

async function cmdRandomMeme(sock, msg, jid) {
  const tries = [...MEME_SUBS.map((s) => ({ path: `${encodeURIComponent(s)}/15`, label: `r/${s}` })), { path: '15', label: 'meme umum' }];
  for (const t of tries) {
    try {
      const m = await memeFrom(t.path);
      const buf = await download(m.url, 14);
      return await sock.sendMessage(
        jid,
        { image: buf, caption: `😂 ${m.title || 'Meme'}\n_(${t.label === 'meme umum' ? 'meme umum, sumber Indonesia lagi kosong' : t.label})_` },
        { quoted: msg }
      );
    } catch (e) {
      // coba sumber berikutnya
    }
  }
  throw new Error('Sumber meme lagi nggak bisa dihubungi. Coba lagi sebentar.');
}

module.exports = { cmdTtStalk, cmdRandomAnime, cmdRandomMeme };
