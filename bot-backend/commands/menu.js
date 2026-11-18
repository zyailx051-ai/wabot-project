const BOT_NAME = process.env.BOT_NAME || 'MyBot';

function mainMenu(pushName) {
  const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  return `╭─❏ 「 ${BOT_NAME} 」
│ 👤 User: ${pushName}
│ ⚡ Status: Online
│ 🕐 ${waktu}
╰───────────────❏

「 ✦ MENU UTAMA ✦ 」
1. 🎨 .menusticker
2. 📥 .menudownload
3. 🛠️ .menutools
4. 👥 .menugroup

Ketik salah satu perintah di atas untuk lihat sub-menu.`;
}

function stickerMenu() {
  return `「 ✦ MENU STICKER ✦ 」
.sticker / .s     – gambar/video ke stiker
.toimg            – stiker ke gambar (reply stiker)
.brat <teks>      – teks ke stiker gaya Brat
.bratvid <teks>   – stiker Brat animasi
.iqc              – reply chat jadi stiker quote
.iqc <teks>       – bikin stiker quote dari teks`;
}

function downloadMenu() {
  return `「 ✦ MENU DOWNLOADER ✦ 」
.tiktok / .tt <link>  – video/foto TikTok (no watermark)
.ig <link>            – Instagram (reel/video)
.fb <link>            – Facebook video
.yt / .ytmp4 <link>   – video YouTube
.ytmp3 <link>         – audio YouTube
.play <judul>         – cari & kirim lagu
.pinterest <link>     – Pinterest (video/gambar)
.twitter / .x <link>  – video Twitter/X`;
}

function toolsMenu() {
  return `「 ✦ MENU TOOLS ✦ 」
.translate <kode> <teks>  – contoh: .translate en halo semua
.tts <teks>               – text to speech
.ss <url>                 – screenshot website
.shortlink <url>          – pendekin link`;
}

function groupMenu() {
  return `「 ✦ MENU GROUP (admin only) ✦ 」
.kick @user         – keluarkan member
.add 628xxx         – tambah member
.promote @user      – jadikan admin
.demote @user       – turunkan admin
.hidetag <teks>     – tag semua member (hidden)
.antilink on/off    – anti-link
.welcome on/off     – pesan welcome/leave
.groupopen          – buka grup
.groupclose         – tutup grup`;
}

module.exports = { mainMenu, stickerMenu, downloadMenu, toolsMenu, groupMenu };
