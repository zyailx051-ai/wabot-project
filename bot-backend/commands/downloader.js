const axios = require('axios');

const TIKWM_BASE = 'https://www.tikwm.com/api/';

async function cmdTiktok(sock, msg, jid, text) {
  if (!text) return sock.sendMessage(jid, { text: 'Contoh: *.tiktok https://vt.tiktok.com/xxxxx*' }, { quoted: msg });
  try {
    const { data } = await axios.get(TIKWM_BASE, { params: { url: text.trim() } });
    if (!data || data.code !== 0 || !data.data) {
      return sock.sendMessage(jid, { text: '❌ Gagal ambil video. Pastikan link TikTok valid & publik.' }, { quoted: msg });
    }
    const d = data.data;
    const videoUrl = d.play || d.hdplay;
    await sock.sendMessage(
      jid,
      {
        video: { url: videoUrl },
        caption: `🎵 *${d.title || 'TikTok Video'}*\n👤 ${d.author?.nickname || '-'}\n❤️ ${d.digg_count || 0} | 💬 ${d.comment_count || 0}`,
      },
      { quoted: msg }
    );
  } catch (err) {
    await sock.sendMessage(jid, { text: '❌ Error download TikTok: ' + err.message }, { quoted: msg });
  }
}

async function notImplementedYet(sock, msg, jid, platform) {
  await sock.sendMessage(
    jid,
    {
      text:
        `⚠️ Downloader *${platform}* belum aktif.\n\n` +
        `Platform ini perlu API key pihak ketiga (karena proteksi mereka sering berubah). ` +
        `Daftar & pasang key-nya di file .env (lihat README bagian "Downloader lanjutan"), ` +
        `lalu fitur ini otomatis aktif.`,
    },
    { quoted: msg }
  );
}

async function cmdInstagram(sock, msg, jid, text) {
  return notImplementedYet(sock, msg, jid, 'Instagram (.ig)');
}
async function cmdFacebook(sock, msg, jid, text) {
  return notImplementedYet(sock, msg, jid, 'Facebook (.fb)');
}
async function cmdYoutube(sock, msg, jid, text) {
  return notImplementedYet(sock, msg, jid, 'YouTube (.yt/.ytmp3/.ytmp4)');
}
async function cmdPinterest(sock, msg, jid, text) {
  return notImplementedYet(sock, msg, jid, 'Pinterest (.pinterest)');
}
async function cmdTwitter(sock, msg, jid, text) {
  return notImplementedYet(sock, msg, jid, 'Twitter/X (.twitter)');
}

module.exports = {
  cmdTiktok,
  cmdInstagram,
  cmdFacebook,
  cmdYoutube,
  cmdPinterest,
  cmdTwitter,
};
