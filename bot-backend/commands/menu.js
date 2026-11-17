const BOT_NAME = process.env.BOT_NAME || 'MyBot';

function mainMenu(pushName) {
  return `╭─❏ 「 ${BOT_NAME} 」
│ 👤 User: ${pushName}
│ ⚡ Status: Online
│ 🕐 ${new Date().toLocaleString('id-ID')}
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
.sticker / .s     – gambar ke stiker (reply/kirim gambar)
.toimg            – stiker ke gambar (reply stiker)
.brat <teks>      – teks ke stiker gaya Brat
.iqc              – reply chat teks jadi stiker quote`;
}

function downloadMenu() {
  return `「 ✦ MENU DOWNLOADER ✦ 」
.tiktok <link>    – download video TikTok (no watermark)
.ig <link>        – Instagram (perlu API key, lihat README)
.fb <link>        – Facebook (perlu API key, lihat README)
.yt <link>        – YouTube (perlu API key, lihat README)
.pinterest <link> – Pinterest (perlu API key, lihat README)
.twitter <link>   – Twitter/X (perlu API key, lihat README)`;
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
